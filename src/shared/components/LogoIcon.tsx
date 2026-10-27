interface LogoIconProps {
  src: string;
  alt: string;
  size?: number;
}

export const LogoIcon = ({ src, alt, size = 16 }: LogoIconProps) => (
  <img
    src={src}
    alt={alt}
    width={size}
    height={size}
    style={{ objectFit: "contain" }}
  />
);
