export default function ResourcesLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
