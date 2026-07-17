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

  it("renders a static image without title caption or decorative block content", () => {
    const markup = renderToStaticMarkup(
      <RenderedMaterialBlock
        assetTags={{}}
        assetUrls={{}}
        block={{
          caption: "Hidden caption",
          id: "image-1",
          imageSize: "FULL",
          title: "Hidden title",
          type: "image",
          url: "https://example.com/tall.png",
        }}
        mode="classroom"
        pageLayout="STATIC_IMAGE"
      />,
    );

    expect(markup).toContain("playsay-render-block-static-image");
    expect(markup).toContain("playsay-rendered-image-static");
    expect(markup).toContain('data-image-size="FULL"');
    expect(markup).not.toContain("<h4>");
    expect(markup).not.toContain("<figcaption>");
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

  it("shows video resize handle only in teacher preview", () => {
    const teacherMarkup = renderToStaticMarkup(
      <RenderedMaterialBlock
        allowVideoFullscreen={false}
        assetTags={{}}
        assetUrls={{}}
        block={rutubeBlock}
        mode="teacherPreview"
        onBlockPatch={() => undefined}
        onBlockPatchCommit={() => undefined}
      />,
    );
    const learnerMarkup = renderToStaticMarkup(
      <RenderedMaterialBlock
        allowVideoFullscreen={false}
        assetTags={{}}
        assetUrls={{}}
        block={rutubeBlock}
        mode="classroom"
      />,
    );

    expect(teacherMarkup).toContain("playsay-video-resize-handle");
    expect(learnerMarkup).not.toContain("playsay-video-resize-handle");
  });
});
