import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MaterialEditorBlock } from "../../model/materialDocument";
import { RenderedMaterialBlock } from "./RenderedMaterialBlock";

const rutubeBlock: MaterialEditorBlock = {
  id: "video-1",
  provider: "RUTUBE",
  title: "Original clip",
  type: "videoEmbed",
  url: "https://rutube.ru/video/abcdef123456/",
};

describe("RenderedMaterialBlock video playback", () => {
  it("removes iframe fullscreen capability when playback is learner-facing", () => {
    const markup = renderToStaticMarkup(
      <RenderedMaterialBlock
        allowVideoFullscreen={false}
        assetTags={{}}
        assetUrls={{}}
        block={rutubeBlock}
        mode="classroom"
      />,
    );

    expect(markup).toContain("<iframe");
    expect(markup).not.toContain("allowfullscreen");
  });

  it("shows a link to the original video source in playback surfaces", () => {
    const markup = renderToStaticMarkup(
      <RenderedMaterialBlock
        allowVideoFullscreen={false}
        assetTags={{}}
        assetUrls={{}}
        block={rutubeBlock}
        mode="classroom"
      />,
    );

    expect(markup).toContain('href="https://rutube.ru/video/abcdef123456/"');
  });
});
