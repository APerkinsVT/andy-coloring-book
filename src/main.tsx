// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

class ErrorBoundary extends React.Component<React.PropsWithChildren, { error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { error };
  }
  componentDidCatch(error: any, info: any) {
    // See full stack in the dev console
    console.error("[ErrorBoundary]", error, info);
  }
  render() {
    if ((this.state as any).error) {
      const err = (this.state as any).error;
      return (
        <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>App crashed</h1>
          <p style={{ marginTop: 8 }}>Fix the error below and reload.</p>
          <pre style={{ whiteSpace: "pre-wrap", background: "#f6f8fa", padding: 12, borderRadius: 6 }}>
            {String(err?.message || err)}
          </pre>
        </div>
      );
    }
    return this.props.children as any;
  }
}

const el = document.getElementById("root") || document.getElementById("app");
if (!el) {
  const div = document.createElement("div");
  div.id = "root";
  document.body.appendChild(div);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
