// app/layout.tsx (Server Component)
import "@/app/globals.css";
import Sidebar from "@/components/Sidebar";
import AuthProvider from "@/components/AuthProvider";

export const metadata = {
  title: "My Next.js App",
  description: "Some description here",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head />    {/* ← required for Metadata API to populate <head> */}
      <body>
        <Sidebar open={true} />
        <main className="ml-64 p-4">
          <AuthProvider>{children}</AuthProvider>
        </main>
      </body>
    </html>
  );
}
