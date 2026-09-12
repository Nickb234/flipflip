import "./globals.css";

export const metadata = {
  title: "FlipLens Market Scanner",
  description: "Bulk fix-and-flip market scanner and comp engine"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
