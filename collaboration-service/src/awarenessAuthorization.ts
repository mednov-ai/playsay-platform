import * as decoding from "lib0/decoding";
import * as awarenessProtocol from "y-protocols/awareness";

export function awarenessClientIds(update: Uint8Array): number[] {
  const decoder = decoding.createDecoder(update);
  const count = decoding.readVarUint(decoder);
  const clientIds: number[] = [];
  for (let index = 0; index < count; index += 1) {
    clientIds.push(decoding.readVarUint(decoder));
    decoding.readVarUint(decoder);
    decoding.readVarString(decoder);
  }
  return clientIds;
}

export function assertAwarenessClientOwnership<T>(
  origin: T,
  clientIds: number[],
  controlledClientIds: Map<T, Set<number>>,
): void {
  for (const [connection, controlledIds] of controlledClientIds) {
    if (connection === origin) continue;
    if (clientIds.some((clientId) => controlledIds.has(clientId))) {
      throw new Error("awareness client id is controlled by another connection");
    }
  }
}

export function authorizeAwarenessUpdate(
  update: Uint8Array,
  canPublishMaterialViewport: boolean,
): Uint8Array {
  if (canPublishMaterialViewport) {
    return update;
  }
  return awarenessProtocol.modifyAwarenessUpdate(update, (state: unknown) => {
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      return state;
    }
    const authorizedState = { ...(state as Record<string, unknown>) };
    delete authorizedState.materialViewport;
    return authorizedState;
  });
}
