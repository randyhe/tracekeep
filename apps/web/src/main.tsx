import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

async function establishLocalSession(): Promise<void> {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const token = hash.get("token");
  if (!token) return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  const response = await fetch("/api/v1/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) throw new Error("Tracekeep local authentication failed.");
}

void establishLocalSession().finally(() => {
  createRoot(document.getElementById("root")!).render(<StrictMode><BrowserRouter><App/></BrowserRouter></StrictMode>);
});
