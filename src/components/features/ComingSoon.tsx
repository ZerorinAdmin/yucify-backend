import Image from "next/image";

type ComingSoonProps = {
  title?: string;
};

export function ComingSoon({ title = "Coming soon, stay tuned!" }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="w-48 h-48 mb-0 flex items-center justify-center">
        <Image
          src="/hourglass.png"
          alt=""
          width={192}
          height={192}
          className="object-contain"
        />
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-foreground">
        {title}
      </h2>
    </div>
  );
}
