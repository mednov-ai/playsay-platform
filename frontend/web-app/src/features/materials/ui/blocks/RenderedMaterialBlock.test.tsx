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
  it("renders an external activity as a Honey School launcher instead of an iframe", () => {
    const markup = renderToStaticMarkup(
      <RenderedMaterialBlock
        assetTags={{}}
        assetUrls={{}}
        block={{
          id: "external-1",
          type: "externalActivity",
          title: "There is / there are",
          url: "https://www.liveworksheets.com/worksheet/en/example/1",
          provider: "LIVEWORKSHEETS",
          externalActivitySupportLevel: "GUARANTEED",
        }}
        mode="classroom"
      />,
    );

    expect(markup).toContain("data-testid=\"external-activity-launch-external-1\"");
    expect(markup).toContain("There is / there are");
    expect(markup).not.toContain("<iframe");
  });

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
    expect(markup).toContain('data-playsay-annotation-anchor="true"');
    expect(markup).toContain('data-image-size="FULL"');
    expect(markup).toContain('data-testid="material-image-focus-image-1"');
    expect(markup).not.toContain("<h4>");
    expect(markup).not.toContain("<figcaption>");
  });

  it("keeps medium images free from focus chrome", () => {
    const markup = renderToStaticMarkup(
      <RenderedMaterialBlock
        assetTags={{}}
        assetUrls={{}}
        block={{ id: "image-medium", imageSize: "MEDIUM", title: "Medium", type: "image", url: "https://example.com/medium.png" }}
        mode="classroom"
        pageLayout="FLOW"
      />,
    );

    expect(markup).not.toContain("material-image-focus-image-medium");
  });

  it("renders an HTML game as an application launcher without mounting an iframe", () => {
    const markup = renderToStaticMarkup(
      <RenderedMaterialBlock
        assetTags={{}}
        assetUrls={{}}
        block={{ id: "game-1", title: "Word race", type: "htmlGame", url: "material-asset:game-asset" }}
        mode="classroom"
      />,
    );

    expect(markup).toContain('data-testid="html-game-launch-game-1"');
    expect(markup).toContain("playsay-html-game-app");
    expect(markup).not.toContain("<iframe");
  });

  it("renders a generated app icon for an enriched HTML game", () => {
    const markup = renderToStaticMarkup(
      <RenderedMaterialBlock
        assetTags={{}}
        assetUrls={{ "icon-asset": "blob:game-icon" }}
        block={{
          gameIconUrl: "material-asset:icon-asset",
          gameTitleSource: "AI",
          id: "game-icon",
          title: "Animal match",
          type: "htmlGame",
          url: "material-asset:game-asset",
        }}
        mode="classroom"
      />,
    );

    expect(markup).toContain('src="blob:game-icon"');
    expect(markup).toContain("Animal match");
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
