import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { USERNAME_MIN, cleanUsername } from "../../lib/username.js";
import Icon from "./Icon.jsx";

// Asks the server (as it is typed) whether a username is free. `current`: the account's own, which needs no check.
// Returns { state: "idle" | "checking" | "ok" | "bad", message }.
export function useUsernameCheck(value, current = null) {
  const [result, setResult] = useState({ state: "idle", message: "" });
  useEffect(() => {
    if (!value || value === current || value.length < USERNAME_MIN) {
      setResult({ state: "idle", message: "" });
      return undefined;
    }
    setResult({ state: "checking", message: "Comprobando…" });
    let live = true;
    const timer = setTimeout(() => {
      api(`/api/username/check?u=${encodeURIComponent(value)}`)
        .then((res) => live && setResult(res.available ? { state: "ok", message: "Disponible" } : { state: "bad", message: res.reason || "No disponible" }))
        .catch(() => live && setResult({ state: "idle", message: "" }));
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [value, current]);
  return result;
}

// The box for a username, with its "@" and the free / taken message under it.
export default function UsernameField({ label = "Nombre de usuario", value, onChange, check, disabled, autoFocus, placeholder = "tu_usuario", required }) {
  return (
    <label className="tv-form-row">
      <span className="tv-label">{label}</span>
      <span className="tv-handle-box">
        <span className="tv-handle-at" aria-hidden="true">@</span>
        <input
          className="tv-field tv-field--sm"
          value={value}
          onChange={(e) => onChange(cleanUsername(e.target.value))}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
          maxLength={40}
          disabled={disabled}
          autoFocus={autoFocus}
          required={required}
        />
      </span>
      {check?.message && (
        <span className={`tv-handle-status is-${check.state}`} role="status">
          {check.state === "ok" && <Icon name="check" size={14} strokeWidth={3} />}
          {check.message}
        </span>
      )}
    </label>
  );
}
