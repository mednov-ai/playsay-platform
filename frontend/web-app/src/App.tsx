import { BookOpen, Video } from "lucide-react";
import { Button } from "./components/ui/button";

export function App() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <header className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h1 className="text-2xl font-semibold">Play&Say</h1>
            <p className="text-sm text-muted-foreground">Dev pipeline check</p>
          </div>
          <Button>
            <Video className="h-4 w-4" />
            Start lesson
          </Button>
        </header>

        <div className="grid flex-1 gap-4 md:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-lg border border-border bg-muted p-4">
            <div className="flex h-full min-h-80 items-center justify-center rounded-md bg-background">
              <div className="text-center">
                <Video className="mx-auto mb-3 h-10 w-10" />
                <h2 className="text-lg font-medium">Waiting room</h2>
                <p className="text-sm text-muted-foreground">Ready for the first lesson.</p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-background p-4">
            <div className="mb-4 flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              <h2 className="text-lg font-medium">Assignment editor</h2>
            </div>
            <textarea
              className="min-h-64 w-full resize-none rounded-md border border-border bg-muted p-3 text-sm outline-none ring-primary/30 focus:ring-2"
              defaultValue="Hello! My name is..."
            />
          </section>
        </div>
      </section>
    </main>
  );
}
