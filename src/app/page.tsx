import { App } from "@/components/app";

export default function Home() {
  return <App clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ""} />;
}
