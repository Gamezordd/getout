import { useEffect } from "react";
import { useRouter } from "next/router";

export default function CreatePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/landing");
  }, [router]);

  return null;
}
