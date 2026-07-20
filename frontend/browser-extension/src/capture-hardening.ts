type SendDebuggerCommand = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

const optionalCaptureHardeningCommands: ReadonlyArray<{
  method: string;
  params: Record<string, unknown>;
}> = [
  { method: "Page.setDownloadBehavior", params: { behavior: "deny" } },
  { method: "Page.setInterceptFileChooserDialog", params: { enabled: true } },
];

export async function applyCaptureHardening(send: SendDebuggerCommand): Promise<void> {
  for (const command of optionalCaptureHardeningCommands) {
    await send(command.method, command.params).catch(() => undefined);
  }
}
