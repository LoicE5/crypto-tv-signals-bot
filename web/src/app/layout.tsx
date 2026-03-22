import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
    title: "Crypto TV Signals Bot",
    description: "Control the crypto signal bot from your browser"
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}
