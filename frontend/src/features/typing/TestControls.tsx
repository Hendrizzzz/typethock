import {
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
  type SyntheticEvent,
} from "react";

import { validateCustomText } from "./prompt";
import { primeKeyboardSound, playKeystroke } from "./keyboardSound";
import type { KeyboardSoundPrefs } from "./storage";
import {
  CODE_EXERCISE_COUNT,
  CODE_LANGUAGES,
  CODE_PATTERN_COUNT,
  CODE_SCENARIO_COUNT,
  codeLanguageLabel,
} from "./codeCorpus";
import {
  TIME_VALUES,
  WORD_VALUES,
  type CodeLanguage,
  type ContentType,
  type TestConfig,
  type TestMode,
  type TypingLanguage,
} from "./types";

interface TestControlsProps {
  config: TestConfig;
  disabled: boolean;
  onChange: (next: TestConfig, customText?: string) => void;
  firstControlRef?: RefObject<HTMLButtonElement | null>;
  /** Optional keyboard-sound preference state and its persistence sink. */
  sound?: KeyboardSoundPrefs;
  onSoundChange?: (next: KeyboardSoundPrefs) => void;
  /** Reports whether the custom-text editor is open, so the page can hide
      the prompt stage while the user composes their own text. */
  onCustomEditorOpenChange?: (open: boolean) => void;
}

type ControlIconName =
  | "time"
  | "words"
  | "quote"
  | "code"
  | "custom"
  | "strict"
  | "thock";

function ControlIcon({ name }: { name: ControlIconName }) {
  const props = {
    width: 12,
    height: 12,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  } as const;
  switch (name) {
    case "time":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "words":
      return (
        <svg {...props}>
          <path d="M4 19 12 4l8 15" />
          <path d="M7 13h10" />
        </svg>
      );
    case "quote":
      return (
        <svg {...props} fill="currentColor" stroke="none">
          <path d="M4 5h7v7H7.5c0 2.6-1.1 4.3-3.5 5.4V5z" />
          <path d="M13 5h7v7h-3.5c0 2.6-1.1 4.3-3.5 5.4V5z" />
        </svg>
      );
    case "code":
      return (
        <svg {...props}>
          <path d="m9 6-5 6 5 6" />
          <path d="m15 6 5 6-5 6" />
        </svg>
      );
    case "custom":
      return (
        <svg {...props}>
          <path d="m4 20 1.2-4.2L16 5l3 3L8.2 18.8 4 20z" />
        </svg>
      );
    case "strict":
      return (
        <svg {...props}>
          <path d="M12 3 22 20H2L12 3z" />
          <path d="M12 10v4" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "thock":
      return (
        <svg {...props}>
          <path d="M4 10v4h4l5 4V6L8 10H4z" />
          <path d="M16.5 9.5a3.5 3.5 0 0 1 0 5" />
        </svg>
      );
  }
}

function ControlGlyph({ glyph }: { glyph: string }) {
  return (
    <span className="control-glyph" aria-hidden="true">
      {glyph}
    </span>
  );
}

export function TestControls({
  config,
  disabled,
  onChange,
  firstControlRef,
  sound,
  onSoundChange,
  onCustomEditorOpenChange,
}: TestControlsProps) {
  const editorErrorId = useId();
  const customButtonRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [customError, setCustomError] = useState("");
  const wordContent = !editorOpen && config.contentType === "words";
  const codeContent = !editorOpen && config.contentType === "code";
  // While the custom editor is open, custom is the active source in the UI;
  // the config itself only switches once text is applied (a textless custom
  // prompt cannot be generated).
  const customActive = editorOpen || config.contentType === "custom";
  const values = config.mode === "time" ? TIME_VALUES : WORD_VALUES;

  useEffect(() => {
    if (editorOpen) {
      editorRef.current?.focus({ preventScroll: true });
    }
  }, [editorOpen]);

  useEffect(() => {
    onCustomEditorOpenChange?.(editorOpen);
  }, [editorOpen, onCustomEditorOpenChange]);

  const applyConfig = (next: TestConfig, nextCustomText?: string) => {
    setEditorOpen(false);
    setCustomError("");
    if (nextCustomText === undefined) {
      onChange(next);
    } else {
      onChange(next, nextCustomText);
    }
  };

  const setMode = (mode: TestMode) => {
    applyConfig({
      ...config,
      contentType: "words",
      mode,
      modeValue: mode === "time" ? 30 : 25,
    });
  };

  const setContent = (contentType: ContentType) => {
    if (contentType === "custom") {
      setCustomError("");
      setEditorOpen(true);
      return;
    }
    applyConfig({
      ...config,
      contentType,
      mode: contentType === "quote" ? "words" : config.mode,
      modeValue:
        contentType === "quote"
          ? config.modeValue
          : config.mode === "time"
            ? 30
            : 25,
      punctuation: contentType === "words" && config.punctuation,
      numbers: contentType === "words" && config.numbers,
      language: contentType === "quote" ? "en" : config.language,
    });
  };

  const setLanguage = (language: TypingLanguage) => {
    applyConfig({ ...config, language });
  };

  const setCodeLanguage = (codeLanguage: CodeLanguage) => {
    applyConfig({ ...config, codeLanguage });
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setCustomError("");
    requestAnimationFrame(() => {
      customButtonRef.current?.focus({ preventScroll: true });
    });
  };

  const applyCustomText = (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => {
    event.preventDefault();
    const validation = validateCustomText(customDraft);
    if (!validation.ok) {
      setCustomError(validation.message);
      return;
    }
    applyConfig(
      {
        ...config,
        contentType: "custom",
        mode: "words",
        modeValue: validation.words.length,
        punctuation: false,
        numbers: false,
      },
      validation.text,
    );
    setEditorOpen(false);
    setCustomError("");
  };

  return (
    <div className="test-controls" aria-label="Test configuration">
      <fieldset className="control-group" data-control-label="source">
        <legend className="sr-only">Text source</legend>
        {(["words", "quote", "code"] as const).map((contentType) => (
          <button
            type="button"
            ref={contentType === "words" ? firstControlRef : undefined}
            key={contentType}
            disabled={disabled}
            aria-pressed={!editorOpen && config.contentType === contentType}
            onClick={() => {
              setContent(contentType);
            }}
          >
            <ControlIcon name={contentType} />
            {contentType}
          </button>
        ))}
        <button
          ref={customButtonRef}
          type="button"
          disabled={disabled}
          aria-expanded={editorOpen}
          aria-controls="custom-text-editor"
          aria-pressed={customActive}
          onClick={() => {
            setContent("custom");
          }}
        >
          <ControlIcon name="custom" />
          custom
        </button>
      </fieldset>

      {wordContent ? (
        <>
          <span className="control-divider" aria-hidden="true" />
          <fieldset className="control-group" data-control-label="measure">
            <legend className="sr-only">Test limit</legend>
            {(["time", "words"] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                disabled={disabled}
                aria-pressed={config.mode === mode}
                onClick={() => {
                  setMode(mode);
                }}
              >
                <ControlIcon name={mode} />
                {mode}
              </button>
            ))}
          </fieldset>
          <fieldset className="control-group" data-control-label="length">
            <legend className="sr-only">
              {config.mode === "time" ? "Seconds" : "Word count"}
            </legend>
            {values.map((value) => (
              <button
                type="button"
                key={value}
                disabled={disabled}
                aria-pressed={config.modeValue === value}
                onClick={() => {
                  applyConfig({ ...config, modeValue: value });
                }}
              >
                {value}
              </button>
            ))}
          </fieldset>
        </>
      ) : null}

      {codeContent ? (
        <>
          <span className="control-divider" aria-hidden="true" />
          <label className="code-language-control" data-control-label="language">
            <span className="sr-only">Code language</span>
            <select
              aria-label="Code language"
              disabled={disabled}
              value={config.codeLanguage ?? "python3"}
              onChange={(event) => {
                setCodeLanguage(event.currentTarget.value as CodeLanguage);
              }}
            >
              {CODE_LANGUAGES.map((language) => (
                <option key={language.id} value={language.id}>
                  {language.label}
                </option>
              ))}
            </select>
            <span className="code-corpus-size">
              {(CODE_EXERCISE_COUNT / CODE_LANGUAGES.length).toLocaleString(
                "en-US",
              )}{" "}
              {codeLanguageLabel(config.codeLanguage ?? "python3")} drills ·{" "}
              {CODE_PATTERN_COUNT} concepts · {CODE_SCENARIO_COUNT} contexts
            </span>
          </label>
        </>
      ) : null}

      {config.contentType === "words" ||
      config.contentType === "custom" ? (
        <>
          <span className="control-divider" aria-hidden="true" />
          <fieldset className="control-group" data-control-label="language">
            <legend className="sr-only">Language</legend>
            {(["en", "es"] as const).map((language) => (
              <button
                type="button"
                key={language}
                disabled={disabled}
                aria-label={language === "en" ? "English" : "Spanish"}
                aria-pressed={config.language === language}
                onClick={() => {
                  setLanguage(language);
                }}
              >
                {language}
              </button>
            ))}
          </fieldset>
        </>
      ) : null}

      {wordContent ? (
        <fieldset className="control-group control-group--modifiers" data-control-label="include">
          <legend className="sr-only">Word modifiers</legend>
          <button
            type="button"
            disabled={disabled}
            aria-pressed={config.punctuation}
            onClick={() => {
              applyConfig({
                ...config,
                punctuation: !config.punctuation,
              });
            }}
          >
            <ControlGlyph glyph="@" />
            punctuation
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-pressed={config.numbers}
            onClick={() => {
              applyConfig({ ...config, numbers: !config.numbers });
            }}
          >
            <ControlGlyph glyph="#" />
            numbers
          </button>
        </fieldset>
      ) : null}

      <span className="control-divider" aria-hidden="true" />
      <fieldset className="control-group" data-control-label="errors">
        <legend className="sr-only">Error behavior</legend>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={config.errorPolicy === "strict"}
          onClick={() => {
            applyConfig({
              ...config,
              errorPolicy:
                config.errorPolicy === "strict" ? "normal" : "strict",
            });
          }}
        >
          <ControlIcon name="strict" />
          strict
        </button>
      </fieldset>

      {sound && onSoundChange ? (
        <fieldset className="control-group control-group--sound" data-control-label="sound">
          <legend className="sr-only">Keyboard sound</legend>
          <button
            type="button"
            // Deliberately usable mid-test: muting never touches test state.
            aria-pressed={sound.enabled}
            aria-label={`Thock keyboard sound ${sound.enabled ? "on" : "off"}`}
            onClick={() => {
              const next = { ...sound, enabled: !sound.enabled };
              onSoundChange(next);
              if (next.enabled) {
                primeKeyboardSound();
                playKeystroke("key", next.volume);
              }
            }}
          >
            <ControlIcon name="thock" />
            thock
          </button>
          {sound.enabled ? (
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sound.volume}
              aria-label="Thock volume"
              onChange={(event) => {
                const next = {
                  ...sound,
                  volume: Number(event.currentTarget.value),
                };
                onSoundChange(next);
                playKeystroke("key", next.volume);
              }}
            />
          ) : null}
        </fieldset>
      ) : null}

      {editorOpen ? (
        <form
          id="custom-text-editor"
          className="custom-text-editor"
          onSubmit={applyCustomText}
        >
          <label htmlFor="custom-text">Your practice text</label>
          <textarea
            ref={editorRef}
            id="custom-text"
            rows={5}
            maxLength={2_000}
            value={customDraft}
            onChange={(event) => {
              setCustomDraft(event.currentTarget.value);
              if (customError) setCustomError("");
            }}
          />
          <div className="custom-editor-meta">
            <span>{String(customDraft.length)}/2000</span>
          </div>
          {customError ? (
            <p id={editorErrorId} className="field-error" role="alert">
              {customError}
            </p>
          ) : null}
          <div className="custom-editor-actions">
            <button type="submit">use text</button>
            <button type="button" onClick={closeEditor}>
              cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
