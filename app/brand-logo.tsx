import Image from 'next/image';
export default function BrandLogo() {
  return (
    <span className="inline-block size-12 shrink-0 overflow-hidden rounded-xl">
      <Image
        unoptimized
        src="/logo-lobo-menor.jpg"
        alt="Logo do sistema — lobo"
        width="48"
        height="48"
        className="size-full object-cover"
      />
    </span>
  );
}
