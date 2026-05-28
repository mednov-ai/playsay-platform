import type { ReactNode } from "react";
import { BookOpen, Bot, FileText, ImageIcon, Layers3, Link2, MousePointer2, PenLine, Users, Video } from "lucide-react";
import type { MaterialBlockType } from "../model/materialDocument";

export function materialBlockIcon(type: MaterialBlockType): ReactNode {
  switch (type) {
    case "videoEmbed":
      return <Video className="h-4 w-4" />;
    case "image":
      return <ImageIcon className="h-4 w-4" />;
    case "generatedImage":
      return <Bot className="h-4 w-4" />;
    case "flashcards":
      return <Layers3 className="h-4 w-4" />;
    case "fillGaps":
    case "multipleChoice":
      return <FileText className="h-4 w-4" />;
    case "matchingPairs":
      return <Link2 className="h-4 w-4" />;
    case "freeWriting":
      return <PenLine className="h-4 w-4" />;
    case "speakingPrompt":
      return <Users className="h-4 w-4" />;
    case "drawingArea":
      return <MousePointer2 className="h-4 w-4" />;
    case "text":
    default:
      return <BookOpen className="h-4 w-4" />;
  }
}
