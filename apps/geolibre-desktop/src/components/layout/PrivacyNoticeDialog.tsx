/**
 * PrivacyNoticeDialog.tsx
 *
 * Data protection and privacy notice for MilGeo.app.
 * Covers EU GDPR (Regulation 2016/679) and the Swiss Federal Act on
 * Data Protection (nDSG / LPD, in force since 1 September 2023).
 *
 * Startup mode:
 *   – Dialog opens automatically and cannot be closed until the user
 *     checks the acknowledgement checkbox and clicks "Agree & Continue".
 *   – An optional "Remember my choice" checkbox (default: checked) persists
 *     the consent to localStorage so the dialog is not shown again.
 *   – The acknowledgement checkbox is only enabled after the user has
 *     scrolled to at least 90% of the notice content.
 */
import {
  Button,
  type ButtonProps,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@geolibre/ui";
import { CheckCircle2, Shield } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Persistence helpers ──────────────────────────────────────────────────────

export const PRIVACY_STORAGE_KEY = "milgeo.privacy.accepted.v1";

/** Returns true if the user has previously accepted and saved their choice. */
export function hasAcceptedPrivacy(): boolean {
  try {
    return localStorage.getItem(PRIVACY_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

// ─── Content ─────────────────────────────────────────────────────────────────

const SECTIONS = [
  {
    title: "1. Identity of the Data Controller",
    body: `MilGeo.app is an open-source, client-side application. There is no
central operator collecting or storing personal data on behalf of users.
When the application is used as a self-hosted or locally installed instance,
the person or organisation that deploys or uses the application acts as the
sole data controller within the meaning of Art. 4 (7) GDPR and Art. 5 lit. j
nDSG.

For the publicly hosted web version (if any), contact information is
available on the project GitHub page at github.com/mlanini/milgeo-app.`,
  },
  {
    title: "2. Guiding Principle: Local-First, Minimal Data",
    body: `MilGeo.app is designed as a local-first application. All geospatial
data, military symbology layers, tactical graphics, and project files that
you create or import are processed exclusively on your own device and are
never transmitted to any external server by the application itself.

The application does not create user accounts, does not set tracking cookies,
does not use analytics services, and does not transmit telemetry data.`,
  },
  {
    title: "3. Data Processed by the Application",
    body: `The following categories of data may be handled entirely locally on
your device:

• Geospatial project data – map layers, coordinates, SIDC codes, unit
  designations, and tactical symbols you create or import. This data remains
  on your device and is never sent externally by the application.

• Application preferences – display settings, theme, recent project
  references. Stored locally (browser localStorage / Tauri app data
  directory). Not transmitted externally.

• Imported files – GeoJSON, KML, MilX (.milxly/.milxlyz), KADAS MilSymb (.milsymb.json),
  and ORBAT (.orbat.json) files you open are read exclusively in-memory on
  your device.

Note: If your project data contains information that relates to or could
identify natural persons (e.g. operator names, personnel positions), you
remain responsible for the lawful processing of such data under GDPR and
nDSG. In particular, classified or operationally sensitive data must be
handled in accordance with applicable national security and classification
regulations, which may supersede the provisions of general data-protection
law.`,
  },
  {
    title: "4. Network Connections and Third-Party Services",
    body: `The application may initiate the following outbound network requests:

4.1 GitHub Update Check (optional, user-initiated)
When you click "Check for updates", the application queries the GitHub
Releases API (api.github.com). This request is subject to GitHub's Privacy
Policy (docs.github.com/en/site-policy/privacy-policies). The only data sent
is the standard HTTP request metadata (IP address, user agent). No personal
data beyond what is technically necessary for the TCP/IP connection is
included. You may decline to use this feature.

4.2 Map Tile Provider
The default basemap tiles are served by OpenFreeMap (openfreemap.org).
Tile requests include your IP address and approximate viewport coordinates.
This is subject to the OpenFreeMap terms of service. You may configure an
alternative or offline tile source in Settings.

4.3 Backend Processing Sidecar (optional)
If a processing sidecar URL is configured (VITE_SIDECAR_URL or
Settings → Sidecar URL), the application may send geospatial data to that
endpoint for processing operations (e.g. vector analysis via WhiteboxTools).
By default this runs on localhost (127.0.0.1:8765) and no data leaves your
device. If you configure a remote URL, you are responsible for ensuring
adequate data-protection measures are in place for that connection.

4.4 External Plugins (optional)
If you load third-party plugins, those plugins may make their own network
requests subject to their respective terms and privacy policies.`,
  },
  {
    title: "5. Legal Bases for Data Processing",
    body: `Under EU GDPR (Art. 6):
• Art. 6(1)(b) – Processing necessary for the performance of a contract or
  in order to take steps prior to entering into a contract (service provision).
• Art. 6(1)(f) – Legitimate interests: ensuring application stability and
  security (update checks are initiated only at user request).

Under Swiss nDSG (Art. 6):
• Data processing is based on the legitimate interest of providing a
  functional, secure application. Processing of personal data remains
  proportionate, relevant, and limited to what is necessary.

Because MilGeo.app does not collect personal data itself (all data is
local to your device), most GDPR/nDSG obligations regarding consent,
retention limits, and data-subject rights apply primarily to the operator
who deploys the application and to the data you choose to store within it.`,
  },
  {
    title: "6. Data Retention and Storage Location",
    body: `All application data (project files, preferences, cached tiles if any)
is stored locally on your device:

• Desktop (Tauri): in the operating-system application data directory
  (e.g. %APPDATA%\milgeo-app on Windows, ~/Library/Application Support
  on macOS, ~/.local/share on Linux).
• Browser / PWA: in browser localStorage and the browser's origin-scoped
  storage (IndexedDB / Cache API).

No data is retained on external servers by the application itself. You
can delete all locally stored data at any time by clearing the
application data or uninstalling the application.`,
  },
  {
    title: "7. Your Rights as a Data Subject",
    body: `Under GDPR (Arts. 15–22) and Swiss nDSG (Arts. 25–27), you hold the
following rights with respect to personal data that is processed about you:

• Right of access – obtain confirmation of whether personal data is
  processed and receive a copy.
• Right to rectification – have inaccurate personal data corrected.
• Right to erasure ("right to be forgotten") – request deletion of
  personal data under the conditions set out in Art. 17 GDPR / Art. 32 nDSG.
• Right to restriction of processing – limit processing in certain
  circumstances (Art. 18 GDPR).
• Right to data portability – receive personal data in a structured,
  machine-readable format (Art. 20 GDPR).
• Right to object – object to processing based on legitimate interests
  (Art. 21 GDPR).
• Right not to be subject to automated individual decision-making –
  MilGeo.app does not perform any automated profiling.

Because MilGeo.app does not operate a centralised database of user data,
most of these rights can be exercised directly by you on your own device
(e.g. deleting project files or clearing application storage).

To exercise any of the above rights or to lodge a complaint, contact the
project maintainer via GitHub Issues or contact the relevant supervisory
authority:
  • EU/EEA: your national Data Protection Authority.
  • Switzerland: Federal Data Protection and Information Commissioner (FDPIC) –
    fdpic.ch / edöb.admin.ch.`,
  },
  {
    title: "8. Security Measures",
    body: `MilGeo.app implements the following technical and organisational measures
to protect data:

• Local processing – data never leaves your device through the application
  itself (see §3 and §4).
• HTTPS enforced – all external network requests use TLS (HTTPS).
• Tauri security sandbox – the desktop build runs in a sandboxed Webview
  with Tauri's capability system restricting filesystem and OS access to
  the minimum required.
• No credentials stored – the application does not store passwords, API
  keys, or authentication tokens.

Important: MilGeo.app is not certified for the processing of classified,
restricted, or operationally sensitive military information. Users handling
such information must comply with applicable national security regulations
and ensure use on approved, air-gapped, or otherwise suitably secured
systems.`,
  },
  {
    title: "9. Use by Minors",
    body: `MilGeo.app is a professional geospatial and military-symbology tool
intended for use by adults in professional, academic, or training contexts.
It is not directed at persons under the age of 16. The application does not
knowingly collect personal data from minors.`,
  },
  {
    title: "10. Changes to This Notice",
    body: `This privacy notice may be updated to reflect changes in the application's
functionality or applicable law. The current version is always accessible
within the application (About → Privacy & Data Protection) and in the
project repository at github.com/mlanini/milgeo-app.

This notice was last reviewed: June 2026.`,
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface PrivacyNoticeDialogProps {
  /**
   * When true the dialog opens automatically, blocks Escape / outside-click,
   * and requires the user to scroll through the content and tick the
   * acknowledgement checkbox before it can be dismissed.
   */
  startupMode?: boolean;
  /** Called when the user agrees (in startup mode only). */
  onAccepted?: () => void;
  /** Controlled open state (used when renderTrigger=false). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  renderTrigger?: boolean;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  triggerClassName?: string;
  triggerLabel?: string;
}

export function PrivacyNoticeDialog({
  startupMode = false,
  onAccepted,
  open,
  onOpenChange,
  renderTrigger = true,
  triggerVariant = "ghost",
  triggerSize = "sm",
  triggerClassName,
  triggerLabel = "Privacy & Data Protection",
}: PrivacyNoticeDialogProps) {
  const [internalOpen, setInternalOpen]   = useState(false);
  const [agreed,       setAgreed]         = useState(false);
  const [remember,     setRemember]       = useState(true);
  const [canAgree,     setCanAgree]       = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const dialogOpen = startupMode ? true : (open ?? internalOpen);

  // Reset per-session state whenever the dialog is opened.
  const prevOpenRef = useRef(dialogOpen);
  if (prevOpenRef.current !== dialogOpen) {
    prevOpenRef.current = dialogOpen;
    if (dialogOpen) {
      setAgreed(false);
      setCanAgree(false);
    }
  }

  // After the dialog opens, check immediately whether the content is short
  // enough to be fully visible without scrolling (in which case it is
  // considered "read" immediately).
  useEffect(() => {
    if (!dialogOpen) return;
    const el = scrollRef.current;
    if (!el) return;
    const checkInitial = () => {
      if (el.scrollHeight <= el.clientHeight + 8) setCanAgree(true);
    };
    // Give the DOM a frame to render before measuring.
    const id = requestAnimationFrame(checkInitial);
    return () => cancelAnimationFrame(id);
  }, [dialogOpen]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || canAgree) return;
    const ratio = (el.scrollTop + el.clientHeight) / el.scrollHeight;
    if (ratio >= 0.9) setCanAgree(true);
  }, [canAgree]);

  const handleAgree = () => {
    if (!agreed) return;
    if (remember) {
      try { localStorage.setItem(PRIVACY_STORAGE_KEY, "true"); } catch { /* ignore */ }
    }
    if (startupMode) {
      onAccepted?.();
    } else {
      setInternalOpen(false);
      onOpenChange?.(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    // In startup mode the dialog can only be closed via "Agree & Continue".
    if (startupMode) return;
    setInternalOpen(next);
    onOpenChange?.(next);
    if (!next) { setAgreed(false); setCanAgree(false); }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      {renderTrigger && !startupMode && (
        <DialogTrigger asChild>
          <Button
            variant={triggerVariant}
            size={triggerSize}
            className={triggerClassName}
            aria-label="Privacy & Data Protection notice"
          >
            <Shield className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">{triggerLabel}</span>
          </Button>
        </DialogTrigger>
      )}

      <DialogContent
        className={`flex max-h-[90vh] max-w-2xl flex-col gap-0 p-0${startupMode ? " [&>button.absolute]:hidden" : ""}`}
        // Startup mode: block all implicit close gestures.
        onInteractOutside={startupMode ? (e: { preventDefault(): void }) => e.preventDefault() : undefined}
        onEscapeKeyDown={startupMode ? (e: { preventDefault(): void }) => e.preventDefault() : undefined}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <DialogHeader className="border-b px-6 py-4 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-primary" />
            Privacy &amp; Data Protection Notice
          </DialogTitle>
          <DialogDescription className="text-xs">
            MilGeo.app &mdash; EU GDPR (Regulation 2016/679) and Swiss nDSG
            (SR 235.1, in force 1 Sep 2023).
            {startupMode && (
              <span className="ml-1 font-medium text-foreground">
                Please read the notice in full before continuing.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* ── Scrollable body ─────────────────────────────────────────────── */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="min-h-0 flex-1 overflow-y-auto px-6 py-4"
        >
          <div className="space-y-5 pb-2 text-sm">
            {/* Preamble */}
            <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              This notice explains how MilGeo.app processes personal data and
              informs you of your rights under the EU General Data Protection
              Regulation (GDPR) and the Swiss Federal Act on Data Protection
              (nDSG / LPD). MilGeo.app is designed as a{" "}
              <strong>local-first application</strong>: no personal data is
              collected, stored, or transmitted by the application itself beyond
              what is strictly necessary for the requested functionality.
            </p>

            {SECTIONS.map((section) => (
              <section key={section.title} className="space-y-1.5">
                <h3 className="font-semibold text-foreground">
                  {section.title}
                </h3>
                <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                  {section.body}
                </p>
              </section>
            ))}

            {/* Footer note */}
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <p>
                <strong>Applicable law:</strong> EU Regulation 2016/679
                (GDPR)&nbsp;&bull;&nbsp;Swiss Federal Act on Data Protection of
                25 September 2020 (nDSG; SR 235.1), in force 1 September
                2023&nbsp;&bull;&nbsp;Swiss Ordinance on Data Protection (DSV;
                SR 235.11).
              </p>
            </div>
          </div>
        </div>

        {/* ── Acceptance footer (startup mode only) ────────────────────── */}
        {startupMode && (
          <div className="shrink-0 space-y-3 border-t bg-muted/20 px-6 py-4">
            {/* Scroll hint */}
            {!canAgree && (
              <p className="text-center text-xs text-muted-foreground animate-pulse">
                ↓ Scroll to the bottom to read the full notice
              </p>
            )}

            {/* Acknowledgement checkbox */}
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition-colors ${
                canAgree
                  ? "hover:bg-muted/60 border-border"
                  : "opacity-40 cursor-not-allowed border-border"
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                disabled={!canAgree}
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span className="text-xs leading-relaxed">
                I have read and understood the Privacy &amp; Data Protection
                Notice. I acknowledge that MilGeo.app processes data as
                described above and that my use of the application is subject
                to the applicable data-protection regulations.
              </span>
            </label>

            {/* Remember checkbox */}
            <label className="flex cursor-pointer items-center gap-2 px-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-primary"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Don&apos;t show this notice again on next launch
            </label>

            {/* Agree button */}
            <Button
              className="w-full gap-2"
              disabled={!agreed}
              onClick={handleAgree}
            >
              <CheckCircle2 className="h-4 w-4" />
              Agree &amp; Continue
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
