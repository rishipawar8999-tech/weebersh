import { authenticate } from "../shopify.server";
import { useRouteError } from "@remix-run/react";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <div style={{ fontFamily: "sans-serif", textAlign: "center", marginTop: "50px" }}>
      <h1 style={{ color: "green", fontSize: "48px", margin: "10px 0" }}>✅</h1>
      <h2>Your Shopify store is connected to Weeber.</h2>
      <p>You can close this tab.</p>
      <div style={{ marginTop: "30px", fontWeight: "bold", fontSize: "24px", color: "#333" }}>Weeber</div>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  console.error(error);
  return (
    <div style={{ fontFamily: "sans-serif", textAlign: "center", marginTop: "50px" }}>
      <h1 style={{ color: "red", fontSize: "48px", margin: "10px 0" }}>❌</h1>
      <h2>Something went wrong.</h2>
      <p>Please try again or contact support@weeber.ai</p>
    </div>
  );
}
