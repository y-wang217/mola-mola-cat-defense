import GameView from "@/components/GameView";

export default function Page() {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col gap-2 p-2 sm:p-3">
      <GameView />
    </main>
  );
}
