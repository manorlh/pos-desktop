import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';

type ProductImageProps = {
  src?: string;
  alt: string;
  className?: string;
  iconClassName?: string;
};

export function ProductImage({ src, alt, className, iconClassName }: ProductImageProps) {
  if (!src) {
    return (
      <div className={cn('bg-muted flex items-center justify-center', className)}>
        <Package className={cn('text-muted-foreground', iconClassName ?? 'h-6 w-6')} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={cn('object-cover bg-muted', className)}
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.display = 'none';
        const parent = e.currentTarget.parentElement;
        if (parent && !parent.querySelector('[data-fallback]')) {
          const fallback = document.createElement('div');
          fallback.dataset.fallback = 'true';
          fallback.className = cn('bg-muted flex items-center justify-center w-full h-full');
          fallback.innerHTML = '<span class="text-xl">📦</span>';
          parent.appendChild(fallback);
        }
      }}
    />
  );
}
