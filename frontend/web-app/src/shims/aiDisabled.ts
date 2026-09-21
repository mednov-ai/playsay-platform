// The PPTX viewer's optional AI panel is disabled by host policy. These guards
// keep its unreachable lazy chunk browser-buildable without installing an AI SDK.
export const isToolUIPart = () => false;
export const isDynamicToolUIPart = () => false;
export const isTextUIPart = () => false;
export const getToolOrDynamicToolName = () => "";
