/* global Blob, WebSocket, window */

import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as Y from "yjs";

const messageSync = 0;
const messageAwareness = 1;
const annotationElementKinds = new Set([
  "arrow",
  "ellipse",
  "line",
  "mindMapNode",
  "rectangle",
  "stickyNote",
  "stroke",
  "text",
]);

export function createYjsWorkspaceRuntime({
  color,
  onAnnotationChange,
  onHtmlGameEffectsChange,
  onHtmlGameInputsChange,
  onHtmlGamePresentationChange = () => undefined,
  onHtmlGameSnapshotsChange,
  onMaterialAnswersChange = () => undefined,
  onDocumentUpdate,
  onParticipantsChange,
  onTextChange,
  participantName,
  snapshot,
}) {
  const ydoc = new Y.Doc();
  applyPersistedSnapshot(ydoc, snapshot);
  const ytext = ydoc.getText("workspace");
  const yannotations = ydoc.getMap("annotations");
  const yhtmlGameSnapshots = ydoc.getMap("htmlGameSnapshots");
  const yhtmlGameInputs = ydoc.getArray("htmlGameInputs");
  const yhtmlGameEffects = ydoc.getArray("htmlGameEffects");
  const yhtmlGamePresentation = ydoc.getMap("htmlGamePresentation");
  const ymaterialAnswerFields = ydoc.getMap("materialAnswerFields");
  const awareness = new awarenessProtocol.Awareness(ydoc);
  let socket = null;
  let disposed = false;

  const updateLocalText = () => {
    if (!disposed) {
      onTextChange(ytext.toString());
    }
  };
  const updateLocalAnnotations = () => {
    if (!disposed) {
      onAnnotationChange(annotationElementsFromMap(yannotations));
    }
  };
  const updateHtmlGameSnapshots = () => {
    if (!disposed) onHtmlGameSnapshotsChange(Object.fromEntries(yhtmlGameSnapshots.entries()));
  };
  const updateHtmlGameInputs = () => {
    if (!disposed) onHtmlGameInputsChange(yhtmlGameInputs.toArray());
  };
  const updateHtmlGameEffects = () => {
    if (!disposed) onHtmlGameEffectsChange(yhtmlGameEffects.toArray());
  };
  const updateHtmlGamePresentation = () => {
    if (!disposed) onHtmlGamePresentationChange(asString(yhtmlGamePresentation.get("activeBlockId")) || null);
  };
  const updateMaterialAnswers = () => {
    if (!disposed) onMaterialAnswersChange(materialAnswersFromFields(ymaterialAnswerFields));
  };
  const syncUpdateHandler = (update, origin) => {
    onDocumentUpdate?.(update);
    if (origin !== socket) {
      sendSyncUpdate(socket, update);
    }
  };
  const awarenessUpdateHandler = (changes, origin) => {
    updateParticipants(awareness, onParticipantsChange);
    if (origin !== socket) {
      sendAwarenessUpdate(socket, awareness, [
        ...changes.added,
        ...changes.updated,
        ...changes.removed,
      ]);
    }
  };

  ytext.observe(updateLocalText);
  yannotations.observeDeep(updateLocalAnnotations);
  yhtmlGameSnapshots.observe(updateHtmlGameSnapshots);
  yhtmlGameInputs.observe(updateHtmlGameInputs);
  yhtmlGameEffects.observe(updateHtmlGameEffects);
  yhtmlGamePresentation.observe(updateHtmlGamePresentation);
  ymaterialAnswerFields.observe(updateMaterialAnswers);
  ydoc.on("update", syncUpdateHandler);
  awareness.on("update", awarenessUpdateHandler);
  awareness.setLocalState({
    cursor: null,
    exerciseInteraction: null,
    htmlGameAuthorities: {},
    user: { color, name: participantName },
  });
  updateLocalText();
  updateLocalAnnotations();
  updateHtmlGameSnapshots();
  updateHtmlGameInputs();
  updateHtmlGameEffects();
  updateHtmlGamePresentation();
  updateMaterialAnswers();

  return {
    applyAnnotationChanges({ deleteIds, upserts }) {
      const nextElements = normalizeAnnotationElements(upserts);
      ydoc.transact(() => {
        deleteIds.forEach((id) => yannotations.delete(id));
        nextElements.forEach((element) => writeAnnotationElement(yannotations, element));
      });
    },
    destroy() {
      disposed = true;
      socket = null;
      awareness.destroy();
      ytext.unobserve(updateLocalText);
      yannotations.unobserveDeep(updateLocalAnnotations);
      yhtmlGameSnapshots.unobserve(updateHtmlGameSnapshots);
      yhtmlGameInputs.unobserve(updateHtmlGameInputs);
      yhtmlGameEffects.unobserve(updateHtmlGameEffects);
      yhtmlGamePresentation.unobserve(updateHtmlGamePresentation);
      ymaterialAnswerFields.unobserve(updateMaterialAnswers);
      ydoc.off("update", syncUpdateHandler);
      ydoc.destroy();
      onParticipantsChange([]);
    },
    getText() {
      return ytext.toString();
    },
    publishHtmlGameEffect(effect) {
      boundedArrayPush(yhtmlGameEffects, effect, 120);
    },
    publishHtmlGameInput(event) {
      boundedArrayPush(yhtmlGameInputs, event, 200);
    },
    handleSocketMessage(data) {
      handleMessage(ydoc, awareness, socket, data);
    },
    setSocket(nextSocket) {
      socket = nextSocket;
    },
    setAnnotationElements(elements) {
      const nextElements = normalizeAnnotationElements(elements);
      ydoc.transact(() => {
        const nextIds = new Set(nextElements.map((element) => element.id));
        yannotations.forEach((_value, id) => {
          if (!nextIds.has(id)) {
            yannotations.delete(id);
          }
        });
        nextElements.forEach((element) => {
          writeAnnotationElement(yannotations, element);
        });
      });
    },
    setHtmlGameSnapshot(blockId, snapshot) {
      yhtmlGameSnapshots.set(blockId, snapshot);
    },
    setHtmlGamePresentedBlock(blockId) {
      const cleanBlockId = asString(blockId);
      if (cleanBlockId) {
        yhtmlGamePresentation.set("activeBlockId", cleanBlockId);
      } else {
        yhtmlGamePresentation.delete("activeBlockId");
      }
    },
    seedMaterialAnswers(answers) {
      if (ymaterialAnswerFields.size > 0) {
        return;
      }
      const normalized = normalizeJsonRecord(answers);
      ydoc.transact(() => {
        Object.entries(normalized).forEach(([blockId, answer]) => {
          writeMaterialAnswerFields(ymaterialAnswerFields, blockId, answer);
        });
      });
    },
    setMaterialAnswer(blockId, answer) {
      const cleanBlockId = asString(blockId);
      const normalized = normalizeJsonObject(answer);
      if (!cleanBlockId || !normalized) {
        return;
      }
      ydoc.transact(() => writeMaterialAnswerFields(ymaterialAnswerFields, cleanBlockId, normalized));
    },
    snapshot() {
      return {
        schemaVersion: 1,
        encoding: "yjs-update-v1",
        yjsUpdateBase64: uint8ArrayToBase64(Y.encodeStateAsUpdate(ydoc)),
        savedAt: new Date().toISOString(),
      };
    },
    startSocketSync(nextSocket) {
      socket = nextSocket;
      sendSyncStep1(nextSocket, ydoc);
      sendAwarenessUpdate(nextSocket, awareness, [ydoc.clientID]);
    },
    updateCursor(cursor) {
      awareness.setLocalStateField("cursor", cursor);
    },
    updateExerciseInteraction(interaction) {
      awareness.setLocalStateField("exerciseInteraction", normalizeExerciseInteraction(interaction));
    },
    updateHtmlGameAuthority(blockId, runId) {
      awareness.setLocalStateField(
        "htmlGameAuthorities",
        updateHtmlGameAuthorityRuns(awareness.getLocalState()?.htmlGameAuthorities, blockId, runId),
      );
    },
    updateText(nextText) {
      if (ytext.toString() === nextText) {
        return;
      }
      ytext.doc?.transact(() => {
        ytext.delete(0, ytext.length);
        ytext.insert(0, nextText);
      });
      onTextChange(nextText);
    },
  };
}

function materialAnswersFromFields(fields) {
  const answers = {};
  fields.forEach((value, encodedPath) => {
    const path = materialAnswerPath(encodedPath);
    if (!path) {
      return;
    }
    const [blockId, ...answerPath] = path;
    const normalized = normalizeJsonValue(value);
    if (normalized === undefined) {
      return;
    }
    const answer = answers[blockId] ?? {};
    setJsonPath(answer, answerPath, normalized);
    answers[blockId] = answer;
  });
  return answers;
}

function writeMaterialAnswerFields(fields, blockId, answer) {
  const nextFields = new Map();
  flattenJsonObject(answer, [], nextFields);
  fields.forEach((_value, encodedPath) => {
    const path = materialAnswerPath(encodedPath);
    if (path?.[0] === blockId && !nextFields.has(JSON.stringify(path.slice(1)))) {
      fields.delete(encodedPath);
    }
  });
  nextFields.forEach((value, encodedAnswerPath) => {
    const answerPath = JSON.parse(encodedAnswerPath);
    const encodedPath = JSON.stringify([blockId, ...answerPath]);
    if (!valuesEqual(fields.get(encodedPath), value)) {
      fields.set(encodedPath, value);
    }
  });
}

function flattenJsonObject(value, path, result) {
  Object.entries(value).forEach(([key, item]) => {
    const nextPath = [...path, key];
    const normalizedObject = normalizeJsonObject(item);
    if (normalizedObject) {
      flattenJsonObject(normalizedObject, nextPath, result);
      return;
    }
    const normalized = normalizeJsonValue(item);
    if (normalized !== undefined) {
      result.set(JSON.stringify(nextPath), normalized);
    }
  });
}

function materialAnswerPath(value) {
  try {
    const path = JSON.parse(value);
    return Array.isArray(path) && path.length >= 2 && path.every((item) => typeof item === "string" && item)
      ? path
      : null;
  } catch {
    return null;
  }
}

function setJsonPath(target, path, value) {
  if (path.length === 0) {
    return;
  }
  let current = target;
  path.slice(0, -1).forEach((key) => {
    const child = asObject(current[key]) ?? {};
    current[key] = child;
    current = child;
  });
  current[path.at(-1)] = value;
}

function normalizeJsonRecord(value) {
  return normalizeJsonObject(value) ?? {};
}

function normalizeJsonObject(value) {
  const object = asObject(value);
  if (!object) {
    return null;
  }
  return Object.fromEntries(Object.entries(object).flatMap(([key, item]) => {
    const normalized = normalizeJsonValue(item);
    return normalized === undefined ? [] : [[key, normalized]];
  }));
}

function normalizeJsonValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const normalized = normalizeJsonValue(item);
      return normalized === undefined ? [] : [normalized];
    });
  }
  return normalizeJsonObject(value) ?? undefined;
}

export function normalizeExerciseInteraction(value) {
  const interaction = asObject(value);
  const blockId = asString(interaction?.blockId);
  const kind = asString(interaction?.kind);
  if (!blockId) {
    return null;
  }
  if (kind === "wordBankDrag") {
    const optionId = asString(interaction?.optionId);
    const targetItemKey = asString(interaction?.targetItemKey);
    return optionId ? {
      blockId,
      kind,
      optionId,
      ...(targetItemKey ? { targetItemKey } : {}),
    } : null;
  }
  if (kind === "matchingSelection") {
    const leftId = asString(interaction?.leftId);
    const rightId = asString(interaction?.rightId);
    return leftId ? {
      blockId,
      kind,
      leftId,
      ...(rightId ? { rightId } : {}),
    } : null;
  }
  return null;
}

function boundedArrayPush(array, value, limit) {
  array.doc?.transact(() => {
    array.push([value]);
    const overflow = array.length - limit;
    if (overflow > 0) array.delete(0, overflow);
  });
}

export function updateHtmlGameAuthorityRuns(current, blockId, runId) {
  const next = normalizeStringRecord(current);
  if (!blockId) {
    return next;
  }
  if (runId) {
    next[blockId] = runId;
  } else {
    delete next[blockId];
  }
  return next;
}

function annotationElementsFromMap(yannotations) {
  return normalizeAnnotationElements([...yannotations.values()].map(annotationElementFromYjs))
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
}

function annotationElementFromYjs(value) {
  return value instanceof Y.Map ? value.toJSON() : value;
}

function writeAnnotationElement(yannotations, element) {
  let yElement = yannotations.get(element.id);
  if (!(yElement instanceof Y.Map)) {
    yElement = new Y.Map();
    yannotations.set(element.id, yElement);
  }

  const nextKeys = new Set(Object.keys(element));
  yElement.forEach((_value, key) => {
    if (!nextKeys.has(key)) {
      yElement.delete(key);
    }
  });

  Object.entries(element).forEach(([key, value]) => {
    if (key === "points" && Array.isArray(value)) {
      writeAnnotationPoints(yElement, value);
      return;
    }
    const current = yElement.get(key);
    if (!valuesEqual(current, value)) {
      yElement.set(key, value);
    }
  });
}

function writeAnnotationPoints(yElement, points) {
  let yPoints = yElement.get("points");
  if (!(yPoints instanceof Y.Array)) {
    yPoints = new Y.Array();
    yElement.set("points", yPoints);
  }

  const currentPoints = yPoints.toArray();
  if (
    currentPoints.length <= points.length &&
    (currentPoints.length === 0 || valuesEqual(currentPoints.at(-1), points[currentPoints.length - 1]))
  ) {
    if (currentPoints.length < points.length) {
      yPoints.push(points.slice(currentPoints.length));
    }
    return;
  }

  let sharedPrefixLength = 0;
  while (
    sharedPrefixLength < currentPoints.length &&
    sharedPrefixLength < points.length &&
    valuesEqual(currentPoints[sharedPrefixLength], points[sharedPrefixLength])
  ) {
    sharedPrefixLength += 1;
  }

  if (sharedPrefixLength < currentPoints.length) {
    yPoints.delete(sharedPrefixLength, currentPoints.length - sharedPrefixLength);
  }
  if (sharedPrefixLength < points.length) {
    yPoints.push(points.slice(sharedPrefixLength));
  }
}

function valuesEqual(left, right) {
  if (left === right) {
    return true;
  }
  if (left instanceof Y.Map || left instanceof Y.Array || right instanceof Y.Map || right instanceof Y.Array) {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeAnnotationElements(elements) {
  if (!Array.isArray(elements)) {
    return [];
  }
  return elements
    .map((element, index) => normalizeAnnotationElement(element, index))
    .filter((element) => element !== null);
}

function normalizeAnnotationElement(value, index) {
  const element = asObject(value);
  const id = asString(element?.id);
  const color = asString(element?.color) || "#ff5c00";
  const anchorId = asString(element?.anchorId);
  const pageId = asString(element?.pageId) || "material";
  const kind = annotationElementKind(element?.kind, element?.points);
  const createdAt = finiteNumberOr(element?.createdAt, index);
  if (!id || !kind) {
    return null;
  }
  const base = { ...(anchorId ? { anchorId } : {}), color, createdAt, id, pageId };

  if (kind === "stroke") {
    const points = Array.isArray(element?.points)
      ? element.points
        .map((point) => normalizeAnnotationPoint(point, pageId))
        .filter((point) => point !== null)
      : [];
    return points.length === 0
      ? null
      : { ...base, kind, points, strokeWidth: normalizeStrokeWidth(element?.strokeWidth) };
  }
  if (kind === "line" || kind === "arrow") {
    const start = normalizeAnnotationPoint(element?.start, pageId);
    const end = normalizeAnnotationPoint(element?.end, pageId);
    return start && end
      ? { ...base, end, kind, start, strokeWidth: normalizeStrokeWidth(element?.strokeWidth) }
      : null;
  }

  const x = finiteNumberOr(element?.x, null);
  const y = finiteNumberOr(element?.y, null);
  const width = finiteNumberOr(element?.width, null);
  const height = finiteNumberOr(element?.height, null);
  if (x === null || y === null || width === null || height === null) {
    return null;
  }
  if (kind === "mindMapNode") {
    const parentId = asString(element?.parentId) || null;
    const mapId = asString(element?.mapId) || (parentId ? "" : id);
    if (!mapId) return null;
    const fontSize = normalizeFontSize(element?.fontSize, parentId === null ? 18 : 14);
    const text = asString(element?.text).slice(0, 500);
    const size = normalizeMindMapSize(parentId, width, height);
    return {
      ...base,
      fill: asString(element?.fill) || "#ffffff",
      fontSize,
      height: size.height,
      kind,
      mapId,
      order: finiteNumberOr(element?.order, index),
      parentId,
      side: parentId === null ? "root" : element?.side === "left" ? "left" : "right",
      text,
      width: size.width,
      x: clampCoordinate(x),
      y: clampCoordinate(y),
    };
  }
  if (kind === "text" || kind === "stickyNote") {
    const autoWidth = kind === "text" ? element?.autoWidth !== false : false;
    return {
      ...base,
      autoWidth,
      fill: asString(element?.fill) || (kind === "stickyNote" ? "#fff0a8" : "transparent"),
      fontSize: normalizeFontSize(element?.fontSize, 30),
      height: kind === "text" ? clampSize(height, 34, 320) : Math.max(36, height),
      kind,
      text: asString(element?.text),
      width: kind === "text" && autoWidth ? clampSize(width, 72, 360) : Math.max(36, width),
      x: clampCoordinate(x),
      y: clampCoordinate(y),
    };
  }
  return {
    ...base,
    fill: asString(element?.fill) || "transparent",
    height: Math.max(36, height),
    kind,
    strokeWidth: normalizeStrokeWidth(element?.strokeWidth),
    width: Math.max(36, width),
    x: clampCoordinate(x),
    y: clampCoordinate(y),
  };
}

function normalizeAnnotationPoint(value, fallbackPageId) {
  const point = asObject(value);
  const x = asFiniteNumber(point?.x);
  const y = asFiniteNumber(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return {
    pageId: asString(point?.pageId) || fallbackPageId,
    x: clampCoordinate(x),
    y: clampCoordinate(y),
  };
}

function annotationElementKind(kind, legacyPoints) {
  return annotationElementKinds.has(kind)
    ? kind
    : Array.isArray(legacyPoints)
      ? "stroke"
      : null;
}

function normalizeStrokeWidth(value) {
  const width = finiteNumberOr(value, 8);
  return width === 4 || width === 16 ? width : 8;
}

function normalizeFontSize(value, fallback) {
  const fontSize = asFiniteNumber(value);
  return fontSize === 14 || fontSize === 18 || fontSize === 24 || fontSize === 30 || fontSize === 32
    ? fontSize
    : fallback;
}

function normalizeMindMapSize(parentId, width, height) {
  const root = parentId === null;
  return {
    height: clampSize(height, root ? 40 : 34, 160),
    width: clampSize(width, root ? 96 : 72, root ? 260 : 220),
  };
}

function clampSize(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finiteNumberOr(value, fallback) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampCoordinate(value) {
  return Math.max(0, Math.min(1000, value));
}

function handleMessage(ydoc, awareness, socket, data) {
  const decoder = decoding.createDecoder(rawMessageToUint8Array(data));
  const messageType = decoding.readVarUint(decoder);
  if (messageType === messageSync) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.readSyncMessage(decoder, encoder, ydoc, socket);
    if (encoding.length(encoder) > 1) {
      socket?.send(encoding.toUint8Array(encoder));
    }
    return;
  }

  if (messageType === messageAwareness) {
    awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), socket);
  }
}

function sendSyncStep1(socket, ydoc) {
  if (!isSocketOpen(socket)) {
    return;
  }
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, ydoc);
  socket.send(encoding.toUint8Array(encoder));
}

function sendSyncUpdate(socket, update) {
  if (!isSocketOpen(socket)) {
    return;
  }
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  socket.send(encoding.toUint8Array(encoder));
}

function sendAwarenessUpdate(socket, awareness, changedClients) {
  if (!isSocketOpen(socket) || changedClients.length === 0) {
    return;
  }
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAwareness);
  encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients));
  socket.send(encoding.toUint8Array(encoder));
}

function updateParticipants(awareness, onParticipantsChange) {
  const nextParticipants = [...awareness.getStates()]
    .filter(([clientId]) => clientId !== awareness.clientID)
    .map(([clientId, state]) => {
      const root = asObject(state);
      const user = asObject(root?.user);
      const cursor = asObject(root?.cursor);
      const htmlGameAuthority = asObject(root?.htmlGameAuthority);
      const htmlGameAuthorityRuns = normalizeStringRecord(root?.htmlGameAuthorities);
      const legacyBlockId = asString(htmlGameAuthority?.blockId);
      const legacyRunId = asString(htmlGameAuthority?.runId);
      if (legacyBlockId && legacyRunId && !htmlGameAuthorityRuns[legacyBlockId]) {
        htmlGameAuthorityRuns[legacyBlockId] = legacyRunId;
      }
      return {
        clientId,
        color: asString(user?.color) || "#2574ff",
        cursor: cursor ? {
          ...(asString(cursor.anchorId) ? { anchorId: asString(cursor.anchorId) } : {}),
          x: clamp01(asNumber(cursor.x)),
          y: clamp01(asNumber(cursor.y)),
        } : null,
        exerciseInteraction: normalizeExerciseInteraction(root?.exerciseInteraction),
        htmlGameAuthorityRuns,
        name: asString(user?.name) || "Play&Say",
      };
    });
  onParticipantsChange(nextParticipants);
}

function applyPersistedSnapshot(ydoc, snapshot) {
  if (!snapshot || snapshot.encoding !== "yjs-update-v1" || typeof snapshot.yjsUpdateBase64 !== "string") {
    return;
  }
  try {
    Y.applyUpdate(ydoc, base64ToUint8Array(snapshot.yjsUpdateBase64));
  } catch {
    // Ignore malformed snapshots and let the live room become the source of truth.
  }
}

function rawMessageToUint8Array(data) {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (data instanceof Blob) {
    throw new Error("Blob websocket messages are not supported");
  }
  return new Uint8Array(data);
}

function isSocketOpen(socket) {
  return Boolean(socket && socket.readyState === WebSocket.OPEN);
}

function uint8ArrayToBase64(value) {
  let binary = "";
  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function base64ToUint8Array(value) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function asObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function normalizeStringRecord(value) {
  const record = asObject(value);
  if (!record) {
    return {};
  }
  return Object.fromEntries(Object.entries(record)
    .map(([key, item]) => [asString(key), asString(item)])
    .filter(([key, item]) => key && item));
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return Number.NaN;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
