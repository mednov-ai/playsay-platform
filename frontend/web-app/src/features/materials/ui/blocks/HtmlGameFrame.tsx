import { useEffect, useMemo, useRef } from "react";
import { Gamepad2, Loader2 } from "lucide-react";
import type {
  MaterialHtmlGameEffect,
  MaterialHtmlGameInputEvent,
  MaterialHtmlGameSync,
} from "../../model/materialDocument";
import { useAppTranslation } from "../../../../shared/i18n";

type BridgeMessage =
  | {
      canvases?: Record<string, string>;
      channel: string;
      controls?: Record<string, {
        checked?: boolean;
        selectedIndex?: number;
        selectionEnd?: number | null;
        selectionStart?: number | null;
        value?: string;
      }>;
      html: string;
      scroll?: Record<string, { left: number; top: number }>;
      sequence: number;
      type: "snapshot";
    }
  | { channel: string; type: "input"; event: Omit<MaterialHtmlGameInputEvent, "id" | "at" | "blockId"> }
  | { channel: string; type: "effect"; effect: Omit<MaterialHtmlGameEffect, "id" | "at" | "blockId"> };

export function HtmlGameFrame({
  blockId,
  fillAvailable = false,
  height,
  html,
  sync,
  title,
}: {
  blockId: string;
  fillAvailable?: boolean;
  height: number;
  html?: string;
  sync?: MaterialHtmlGameSync;
  title: string;
}) {
  const { t } = useAppTranslation();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const channel = useMemo(() => crypto.randomUUID(), [blockId, html]);
  const isMirror = Boolean(sync && !sync.isAuthority);
  const srcDoc = useMemo(() => html ? createSandboxedGameDocument(html, channel, isMirror) : "", [channel, html, isMirror]);
  const handledInputsRef = useRef<Set<string> | null>(null);
  const handledEffectsRef = useRef<Set<string> | null>(null);
  const activeSnapshot = sync?.snapshots[blockId];
  const authorityRunId = sync?.authorityRuns[blockId];
  const authorityAvailable = !isMirror || Boolean(authorityRunId && activeSnapshot?.runId === authorityRunId);

  useEffect(() => {
    handledInputsRef.current = null;
    handledEffectsRef.current = null;
  }, [blockId, channel, sync?.isAuthority]);

  useEffect(() => {
    if (!html || !sync?.isAuthority || !sync.ready) {
      return undefined;
    }
    sync.setAuthorityRun(blockId, channel);
    return () => sync.setAuthorityRun(blockId, null);
  }, [blockId, channel, html, sync?.isAuthority, sync?.ready, sync?.setAuthorityRun]);

  useEffect(() => {
    function handleMessage(messageEvent: MessageEvent<BridgeMessage>) {
      if (messageEvent.source !== iframeRef.current?.contentWindow || messageEvent.data?.channel !== channel) {
        return;
      }
      const message = messageEvent.data;
      if (message.type === "snapshot" && sync?.isAuthority) {
        sync.publishSnapshot(blockId, {
          canvases: message.canvases,
          controls: message.controls,
          html: message.html,
          runId: channel,
          scroll: message.scroll,
          sequence: message.sequence,
          updatedAt: Date.now(),
        });
      } else if (message.type === "input" && sync) {
        const input = {
          ...message.event,
          at: Date.now(),
          blockId,
          id: crypto.randomUUID(),
          runId: sync.isAuthority ? channel : sync.authorityRuns[blockId],
        };
        if (sync.isAuthority) {
          (handledInputsRef.current ??= new Set()).add(input.id);
        }
        sync.publishInput(input);
      } else if (message.type === "effect" && sync?.isAuthority) {
        sync.publishEffect({
          ...message.effect,
          at: Date.now(),
          blockId,
          id: crypto.randomUUID(),
        });
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [blockId, channel, sync]);

  useEffect(() => {
    if (!sync?.isAuthority) {
      return;
    }
    if (handledInputsRef.current === null) {
      handledInputsRef.current = new Set(sync.inputs.map((event) => event.id));
      return;
    }
    sync.inputs.forEach((event) => {
      if (event.blockId !== blockId || handledInputsRef.current?.has(event.id)) {
        return;
      }
      handledInputsRef.current?.add(event.id);
      if (event.runId !== channel) {
        return;
      }
      iframeRef.current?.contentWindow?.postMessage({ channel, type: "applyInput", event }, "*");
    });
  }, [blockId, channel, sync?.inputs, sync?.isAuthority]);

  useEffect(() => {
    if (!sync || sync.isAuthority) {
      return;
    }
    const snapshot = activeSnapshot;
    if (snapshot) {
      iframeRef.current?.contentWindow?.postMessage({ channel, type: "applySnapshot", snapshot }, "*");
    }
  }, [activeSnapshot, blockId, channel, sync]);

  useEffect(() => {
    if (!sync || sync.isAuthority) {
      return;
    }
    if (handledEffectsRef.current === null) {
      handledEffectsRef.current = new Set(sync.effects.map((effect) => effect.id));
      return;
    }
    sync.effects.forEach((effect) => {
      if (effect.blockId !== blockId || handledEffectsRef.current?.has(effect.id)) {
        return;
      }
      handledEffectsRef.current?.add(effect.id);
      iframeRef.current?.contentWindow?.postMessage({ channel, type: "applyEffect", effect }, "*");
    });
  }, [blockId, channel, sync?.effects, sync?.isAuthority]);

  if (!html) {
    return (
      <div className="playsay-html-game-placeholder" role="status">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span>{t("materials.renderer.htmlGameLoading")}</span>
      </div>
    );
  }

  return (
    <div
      className="playsay-html-game"
      data-authority={sync?.isAuthority ? "true" : "false"}
      data-fill-available={fillAvailable ? "true" : "false"}
      data-paused={authorityAvailable ? "false" : "true"}
    >
      <iframe
        allow="autoplay"
        ref={iframeRef}
        sandbox="allow-scripts allow-forms allow-pointer-lock"
        srcDoc={srcDoc}
        style={{ height: fillAvailable ? "100%" : height }}
        title={title}
      />
      {isMirror && !authorityAvailable ? (
        <div className="playsay-html-game-waiting" role="status">
          <Gamepad2 className="h-5 w-5 text-primary" />
          <span>{t("materials.renderer.htmlGameWaiting")}</span>
        </div>
      ) : null}
    </div>
  );
}

export function createSandboxedGameDocument(html: string, channel: string, mirror: boolean): string {
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">`;
  const bridge = `<script data-playsay-game-bridge>${gameBridgeSource(channel, mirror)}</script>`;
  const headContent = `${csp}${bridge}`;
  const withHead = /<head\b[^>]*>/i.test(html)
    ? html.replace(/<head\b[^>]*>/i, (head) => `${head}${headContent}`)
    : html.replace(/<html\b[^>]*>/i, (root) => `${root}<head>${headContent}</head>`);
  if (!mirror) {
    return withHead;
  }
  return withHead.replace(/<script\b(?![^>]*data-playsay-game-bridge)([^>]*)>/gi, '<script type="application/playsay-disabled"$1>');
}

function gameBridgeSource(channel: string, mirror: boolean): string {
  return `(() => {
    const channel = ${JSON.stringify(channel)};
    const mirror = ${mirror ? "true" : "false"};
    const nativePostMessage = window.parent.postMessage.bind(window.parent);
    const memory = new Map();
    const storage = {
      get length() { return memory.size; },
      clear() { memory.clear(); },
      getItem(key) { const value = memory.get(String(key)); return value === undefined ? null : value; },
      key(index) { return [...memory.keys()][index] ?? null; },
      removeItem(key) { memory.delete(String(key)); },
      setItem(key, value) { memory.set(String(key), String(value)); }
    };
    try { Object.defineProperty(window, 'localStorage', { configurable: false, value: storage }); } catch (_) {}
    let nextNodeId = 1;
    let snapshotSequence = 0;
    let snapshotDebounceTimer = 0;
    let snapshotMaxTimer = 0;
    let lastSnapshotHtml = '';
    let lastSnapshotAt = 0;
    let dragTransfer = null;
    let pointerDragSourceId = null;
    let pointerDragStartX = 0;
    let pointerDragStartY = 0;
    let pointerDragLastX = 0;
    let pointerDragLastY = 0;
    let nativeDragStarted = false;
    const identify = (root = document) => {
      if (root.nodeType === 1 && !root.dataset.playsayNodeId) root.dataset.playsayNodeId = String(nextNodeId++);
      root.querySelectorAll?.('*').forEach((node) => {
        if (!node.dataset.playsayNodeId) node.dataset.playsayNodeId = String(nextNodeId++);
      });
    };
    const send = (value) => nativePostMessage({ channel, ...value }, '*');
    const formState = (node) => {
      const state = {};
      if ('value' in node) state.value = String(node.value ?? '');
      if ('checked' in node) state.checked = Boolean(node.checked);
      if ('selectedIndex' in node) state.selectedIndex = Number(node.selectedIndex);
      if ('selectionStart' in node) {
        state.selectionStart = node.selectionStart;
        state.selectionEnd = node.selectionEnd;
      }
      return state;
    };
    const serializeControls = () => Object.fromEntries(
      [...document.querySelectorAll('input, textarea, select')]
        .map((node) => [targetId(node), formState(node)])
    );
    const serializeScroll = () => {
      const entries = [];
      const documentScroller = document.scrollingElement;
      if (documentScroller) entries.push(['__document__', { left: documentScroller.scrollLeft, top: documentScroller.scrollTop }]);
      document.querySelectorAll('[data-playsay-node-id]').forEach((node) => {
        if (node.scrollLeft || node.scrollTop) entries.push([targetId(node), { left: node.scrollLeft, top: node.scrollTop }]);
      });
      return Object.fromEntries(entries);
    };
    const serializeCanvases = () => Object.fromEntries(
      [...document.querySelectorAll('canvas')].flatMap((canvas) => {
        try { return [[targetId(canvas), canvas.toDataURL('image/png')]]; } catch (_) { return []; }
      })
    );
    const flushSnapshot = () => {
      window.clearTimeout(snapshotDebounceTimer);
      window.clearTimeout(snapshotMaxTimer);
      snapshotDebounceTimer = 0;
      snapshotMaxTimer = 0;
      identify();
      const html = document.body?.outerHTML ?? '<body></body>';
      const controls = serializeControls();
      const scroll = serializeScroll();
      const canvases = serializeCanvases();
      const signature = JSON.stringify([html, controls, scroll, canvases]);
      if (signature === lastSnapshotHtml) return;
      lastSnapshotHtml = signature;
      lastSnapshotAt = Date.now();
      send({ type: 'snapshot', canvases, controls, html, scroll, sequence: ++snapshotSequence });
    };
    const scheduleSnapshot = (meaningfulInput = false) => {
      if (mirror) return;
      window.clearTimeout(snapshotDebounceTimer);
      const now = Date.now();
      const minimumIntervalRemaining = lastSnapshotAt ? Math.max(0, (meaningfulInput ? 50 : 500) - (now - lastSnapshotAt)) : 0;
      snapshotDebounceTimer = window.setTimeout(flushSnapshot, Math.max(meaningfulInput ? 0 : 250, minimumIntervalRemaining));
      if (!snapshotMaxTimer) {
        snapshotMaxTimer = window.setTimeout(flushSnapshot, Math.max(500, minimumIntervalRemaining));
      }
    };
    const targetId = (target) => {
      if (target === document || target === window || !target?.closest) return '__document__';
      const node = target.closest('[data-playsay-node-id]');
      return node?.dataset.playsayNodeId ?? '__document__';
    };
    const semanticInputTypes = new Set(['beforeinput', 'input', 'change', 'focus', 'blur', 'compositionstart', 'compositionupdate', 'compositionend']);
    const inputTypes = ['click', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'dragstart', 'dragover', 'drop', ...semanticInputTypes];
    inputTypes.forEach((type) => document.addEventListener(type, (event) => {
      if (event.__playsayReplay) return;
      const resolvedTarget = mirror && type === 'pointerup' && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
        ? document.elementFromPoint(event.clientX, event.clientY) ?? event.target
        : event.target;
      const eventTargetId = targetId(resolvedTarget);
      if (mirror) {
        const editableTarget = Boolean(event.target?.closest?.('input, textarea, select, [contenteditable="true"]'));
        const nativeDragEvent = type === 'pointerdown' || type === 'pointerup' || type === 'dragstart' || type === 'dragover' || type === 'drop';
        const allowNativeEditing = semanticInputTypes.has(type) || (editableTarget && (type === 'keydown' || type === 'keyup'));
        if (!allowNativeEditing && (type === 'dragover' || !nativeDragEvent)) event.preventDefault();
        if (!nativeDragEvent) event.stopImmediatePropagation();
        if (type === 'pointerdown') {
          const draggable = event.target?.closest?.('[draggable="true"]');
          pointerDragSourceId = draggable ? targetId(draggable) : null;
          pointerDragStartX = Number(event.clientX) || 0;
          pointerDragStartY = Number(event.clientY) || 0;
          pointerDragLastX = pointerDragStartX;
          pointerDragLastY = pointerDragStartY;
          nativeDragStarted = false;
        } else if (type === 'dragstart') {
          pointerDragSourceId = eventTargetId;
          nativeDragStarted = true;
        } else if (type === 'drop') {
          pointerDragSourceId = null;
          nativeDragStarted = false;
        }
      }
      send({ type: 'input', event: {
        type,
        targetId: eventTargetId,
        key: event.key,
        code: event.code,
        altKey: Boolean(event.altKey),
        ctrlKey: Boolean(event.ctrlKey),
        metaKey: Boolean(event.metaKey),
        shiftKey: Boolean(event.shiftKey),
        ...formState(resolvedTarget),
        data: event.data ?? null,
        inputType: event.inputType
      }});
      if (!mirror) scheduleSnapshot(semanticInputTypes.has(type));
    }, true));
    document.addEventListener('pointermove', (event) => {
      if (!mirror || !pointerDragSourceId) return;
      pointerDragLastX = Number(event.clientX) || pointerDragLastX;
      pointerDragLastY = Number(event.clientY) || pointerDragLastY;
    }, true);
    const finishPointerDrag = (event) => {
      if (!mirror || !pointerDragSourceId) return;
      const eventX = Number(event.clientX) || 0;
      const eventY = Number(event.clientY) || 0;
      const eventDistance = Math.hypot(eventX - pointerDragStartX, eventY - pointerDragStartY);
      const trackedDistance = Math.hypot(pointerDragLastX - pointerDragStartX, pointerDragLastY - pointerDragStartY);
      const destinationX = trackedDistance > eventDistance ? pointerDragLastX : eventX;
      const destinationY = trackedDistance > eventDistance ? pointerDragLastY : eventY;
      const distance = Math.max(eventDistance, trackedDistance);
      if (!nativeDragStarted && distance < 8) {
        pointerDragSourceId = null;
        return;
      }
      const destination = document.elementFromPoint(destinationX, destinationY) ?? event.target;
      const destinationId = targetId(destination);
      send({ type: 'input', event: { type: 'dragstart', targetId: pointerDragSourceId } });
      send({ type: 'input', event: { type: 'dragover', targetId: destinationId } });
      send({ type: 'input', event: { type: 'drop', targetId: destinationId } });
      pointerDragSourceId = null;
      nativeDragStarted = false;
    };
    document.addEventListener('mouseup', finishPointerDrag, true);
    document.addEventListener('dragend', finishPointerDrag, true);
    const makeEvent = (input) => {
      const common = { bubbles: true, cancelable: true, composed: true };
      let event;
      if (input.type === 'keydown' || input.type === 'keyup') {
        event = new KeyboardEvent(input.type, { ...common, key: input.key ?? '', code: input.code ?? '', altKey: input.altKey, ctrlKey: input.ctrlKey, metaKey: input.metaKey, shiftKey: input.shiftKey });
      } else if (input.type === 'beforeinput' || input.type === 'input') {
        event = new InputEvent(input.type, { ...common, data: input.data ?? null, inputType: input.inputType ?? '' });
      } else if (input.type.startsWith('composition')) {
        event = new CompositionEvent(input.type, { ...common, data: input.data ?? '' });
      } else if (input.type === 'change' || input.type === 'focus' || input.type === 'blur') {
        event = new Event(input.type, common);
      } else if (input.type.startsWith('pointer')) {
        event = new PointerEvent(input.type, common);
      } else if (input.type === 'dragstart' || input.type === 'dragover' || input.type === 'drop') {
        if (input.type === 'dragstart' || !dragTransfer) dragTransfer = new DataTransfer();
        event = new DragEvent(input.type, { ...common, dataTransfer: dragTransfer });
      } else {
        event = new MouseEvent(input.type, common);
      }
      Object.defineProperty(event, '__playsayReplay', { value: true });
      return event;
    };
    const applyFormState = (target, state) => {
      if (!target || target === document) return;
      if ('value' in target && state.value !== undefined) target.value = state.value;
      if ('checked' in target && state.checked !== undefined) target.checked = Boolean(state.checked);
      if ('selectedIndex' in target && state.selectedIndex !== undefined) target.selectedIndex = Number(state.selectedIndex);
      if (
        typeof target.setSelectionRange === 'function'
        && state.selectionStart !== undefined
        && state.selectionStart !== null
      ) {
        try { target.setSelectionRange(state.selectionStart, state.selectionEnd ?? state.selectionStart); } catch (_) {}
      }
    };
    const applySnapshotState = (snapshot) => {
      Object.entries(snapshot.controls ?? {}).forEach(([id, state]) => {
        const target = document.querySelector('[data-playsay-node-id="' + CSS.escape(id) + '"]');
        applyFormState(target, state);
      });
      Object.entries(snapshot.scroll ?? {}).forEach(([id, state]) => {
        const target = id === '__document__'
          ? document.scrollingElement
          : document.querySelector('[data-playsay-node-id="' + CSS.escape(id) + '"]');
        if (target) {
          target.scrollLeft = Number(state.left) || 0;
          target.scrollTop = Number(state.top) || 0;
        }
      });
      Object.entries(snapshot.canvases ?? {}).forEach(([id, dataUrl]) => {
        const canvas = document.querySelector('[data-playsay-node-id="' + CSS.escape(id) + '"]');
        if (!(canvas instanceof HTMLCanvasElement) || !dataUrl) return;
        const image = new Image();
        image.onload = () => canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
        image.src = dataUrl;
      });
    };
    const playEffect = (effect) => {
      if (effect.kind === 'speech' && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(String(effect.payload.text ?? ''));
        utterance.lang = String(effect.payload.lang ?? 'en-US');
        utterance.rate = Number(effect.payload.rate ?? 1);
        utterance.pitch = Number(effect.payload.pitch ?? 1);
        window.speechSynthesis.speak(utterance);
      } else if (effect.kind === 'audio') {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        const context = new AudioContextClass();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = String(effect.payload.oscillatorType ?? 'sine');
        oscillator.frequency.setValueAtTime(Number(effect.payload.from ?? 220), context.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, Number(effect.payload.to ?? effect.payload.from ?? 220)), context.currentTime + Number(effect.payload.duration ?? .1));
        gain.gain.setValueAtTime(Number(effect.payload.volume ?? .05), context.currentTime);
        gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + Number(effect.payload.duration ?? .1));
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + Number(effect.payload.duration ?? .1));
        oscillator.onended = () => context.close?.();
      }
    };
    const patchAttributes = (current, next) => {
      [...current.attributes].forEach((attribute) => {
        if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
      });
      [...next.attributes].forEach((attribute) => {
        if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
      });
    };
    const patchNode = (current, next) => {
      if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) {
        current.replaceWith(next.cloneNode(true));
        return;
      }
      if (current.nodeType === Node.TEXT_NODE) {
        if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
        return;
      }
      if (current.nodeType !== Node.ELEMENT_NODE) return;
      patchAttributes(current, next);
      const nextChildren = [...next.childNodes];
      let cursor = current.firstChild;
      nextChildren.forEach((nextChild) => {
        const nodeId = nextChild.nodeType === Node.ELEMENT_NODE ? nextChild.dataset.playsayNodeId : '';
        let match = null;
        if (nodeId) {
          match = [...current.childNodes].find((child) => child.nodeType === Node.ELEMENT_NODE && child.dataset.playsayNodeId === nodeId) ?? null;
        } else if (cursor && cursor.nodeType === nextChild.nodeType && cursor.nodeName === nextChild.nodeName) {
          match = cursor;
        }
        if (!match) {
          match = nextChild.cloneNode(true);
          current.insertBefore(match, cursor);
        } else if (match !== cursor) {
          current.insertBefore(match, cursor);
        }
        patchNode(match, nextChild);
        cursor = match.nextSibling;
      });
      while (cursor) {
        const nextCursor = cursor.nextSibling;
        cursor.remove();
        cursor = nextCursor;
      }
    };
    window.addEventListener('message', (messageEvent) => {
      const message = messageEvent.data;
      if (!message || message.channel !== channel) return;
      if (message.type === 'applySnapshot' && mirror) {
        const parsed = new DOMParser().parseFromString(message.snapshot.html, 'text/html');
        parsed.querySelectorAll('script').forEach((script) => script.type = 'application/playsay-disabled');
        if (document.body && parsed.body) patchNode(document.body, parsed.body);
        identify();
        applySnapshotState(message.snapshot);
      } else if (message.type === 'applyInput' && !mirror) {
        const input = message.event;
        const target = input.targetId === '__document__' ? document : document.querySelector('[data-playsay-node-id="' + CSS.escape(input.targetId) + '"]');
        applyFormState(target, input);
        if (input.type === 'focus') target?.focus?.();
        if (input.type === 'blur') target?.blur?.();
        target?.dispatchEvent(makeEvent(input));
        scheduleSnapshot(semanticInputTypes.has(input.type));
      } else if (message.type === 'applyEffect' && mirror) {
        playEffect(message.effect);
      }
    });
    if (!mirror) {
      const patchSpeech = () => {
        if (!window.speechSynthesis) return;
        const nativeSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
        window.speechSynthesis.speak = (utterance) => {
          send({ type: 'effect', effect: { kind: 'speech', payload: { text: utterance.text, lang: utterance.lang, rate: utterance.rate, pitch: utterance.pitch } } });
          return nativeSpeak(utterance);
        };
      };
      const patchAudio = () => {
        const prototype = window.BaseAudioContext?.prototype;
        if (!prototype || prototype.__playsayPatched) return;
        Object.defineProperty(prototype, '__playsayPatched', { value: true });
        const nativeCreateOscillator = prototype.createOscillator;
        prototype.createOscillator = function() {
          const oscillator = nativeCreateOscillator.call(this);
          const meta = { from: oscillator.frequency.value, to: oscillator.frequency.value, duration: .1, volume: .05 };
          const nativeSet = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
          const nativeRamp = oscillator.frequency.exponentialRampToValueAtTime.bind(oscillator.frequency);
          oscillator.frequency.setValueAtTime = (value, time) => { meta.from = Number(value); meta.to = Number(value); return nativeSet(value, time); };
          oscillator.frequency.exponentialRampToValueAtTime = (value, time) => { meta.to = Number(value); meta.duration = Math.max(.01, Number(time) - this.currentTime); return nativeRamp(value, time); };
          const nativeConnect = oscillator.connect.bind(oscillator);
          oscillator.connect = (node, ...args) => {
            if (node?.gain) {
              const gainParam = node.gain;
              const gainSet = gainParam.setValueAtTime.bind(gainParam);
              gainParam.setValueAtTime = (value, time) => { meta.volume = Number(value); return gainSet(value, time); };
            }
            return nativeConnect(node, ...args);
          };
          const nativeStop = oscillator.stop.bind(oscillator);
          oscillator.stop = (when) => {
            if (Number.isFinite(when)) meta.duration = Math.max(.01, Number(when) - this.currentTime);
            send({ type: 'effect', effect: { kind: 'audio', payload: { oscillatorType: oscillator.type, ...meta } } });
            return nativeStop(when);
          };
          return oscillator;
        };
      };
      patchSpeech();
      patchAudio();
    }
    const start = () => {
      identify();
      if (!mirror) {
        new MutationObserver(scheduleSnapshot).observe(document.documentElement, { attributes: true, characterData: true, childList: true, subtree: true });
        scheduleSnapshot();
      }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  })();`;
}
