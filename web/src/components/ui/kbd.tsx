export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
      {children}
    </kbd>
  );
}
