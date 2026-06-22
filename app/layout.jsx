import "./globals.css";

export const metadata = {
  title: "Air Horse Kart",
  description: "A super cute pastel go-kart racing game made with Next.js and Three.js."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
