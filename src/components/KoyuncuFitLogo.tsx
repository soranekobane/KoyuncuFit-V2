import { cn } from '../lib/utils';

export function KoyuncuFitLogo({
  variant = 'full',
  size = 'md',
  className,
}: {
  variant?: 'full' | 'emblem' | 'header';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const emblemSizes = {
    xs: 'h-6 w-6',
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-16 w-16',
    xl: 'h-24 w-24',
  };

  if (variant === 'emblem') {
    return (
      <img
        src="/icons/icon-192.png"
        alt="KoyuncuFit Emblem"
        className={cn(emblemSizes[size], 'object-contain rounded-xl shadow-md shadow-brand/20', className)}
      />
    );
  }

  if (variant === 'header') {
    return (
      <div className={cn('inline-flex items-center gap-2.5 font-black tracking-tight select-none', className)}>
        <img
          src="/icons/icon-192.png"
          alt="KoyuncuFit"
          className="h-8 w-8 object-contain rounded-xl shadow-sm shadow-brand/30"
        />
        <div className="flex items-baseline text-[20px] font-black tracking-tight">
          <span className="text-zinc-100">Koyuncu</span>
          <span className="text-[#00f090] ml-0.5">Fit</span>
        </div>
      </div>
    );
  }

  // variant === 'full'
  return (
    <div className={cn('flex flex-col items-center', className)}>
      <img
        src="/icons/koyuncufit-logo.png"
        alt="KoyuncuFit Official Logo"
        className="h-28 w-28 object-contain drop-shadow-[0_10px_25px_rgba(30,112,255,0.3)] transition-transform"
      />
    </div>
  );
}
