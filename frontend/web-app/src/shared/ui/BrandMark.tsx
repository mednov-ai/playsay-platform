export function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-16 w-16 place-items-center rounded-[1.1rem] bg-white text-center text-[1.35rem] font-black leading-[0.86] text-primary shadow-[0_16px_38px_rgba(255,92,0,0.14)] -rotate-3">
        Play
        <br />
        &Say
      </div>
      <div>
        <div className="text-sm font-black uppercase text-primary">Play&Say</div>
        <div className="text-xs font-bold text-muted-foreground">english studio</div>
      </div>
    </div>
  );
}
