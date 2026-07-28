"use client";

import type { FormEvent } from "react";
import { useState } from "react";

import { parseGitHubPermalink } from "@/lib/domain/github-permalink";

type LineConditionFormProps = {
  action: string;
  eventType: string;
  repositoryOwner: string;
  repositoryName: string;
};

export function LineConditionForm({
  action,
  eventType,
  repositoryOwner,
  repositoryName,
}: LineConditionFormProps) {
  const locationErrorId = `line-location-error-${eventType.toLowerCase()}`;
  const [filePath, setFilePath] = useState("");
  const [lineNumber, setLineNumber] = useState("");
  const [locationError, setLocationError] = useState("");
  const [triggerError, setTriggerError] = useState("");

  function updateLocation(value: string) {
    const permalink = parseGitHubPermalink(value);
    if (!permalink) {
      setFilePath(value);
      setLocationError(
        /github\.com|^\s*\[[^\]]*]\(/i.test(value)
          ? "Use a GitHub file URL with a line anchor, such as #L42."
          : "",
      );
      return;
    }

    const matchesRepository =
      permalink.owner.toLowerCase() === repositoryOwner.toLowerCase() &&
      permalink.repository.toLowerCase() === repositoryName.toLowerCase();
    if (!matchesRepository) {
      setFilePath(value);
      setLocationError(
        `Use a permalink from ${repositoryOwner}/${repositoryName}.`,
      );
      return;
    }

    setFilePath(permalink.filePath);
    setLineNumber(String(permalink.lineNumber));
    setLocationError("");
  }

  function validateTriggers(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const hasTrigger = [
      "notifyOnRemoved",
      "notifyOnMoved",
      "notifyOnChanged",
    ].some((name) => data.has(name));

    if (!hasTrigger) {
      event.preventDefault();
      setTriggerError("Select at least one notification trigger.");
    }
  }

  return (
    <form action={action} method="post" onSubmit={validateTriggers}>
      <input type="hidden" name="eventType" value={eventType} />
      <input type="hidden" name="conditionType" value="LINE_CHANGE" />
      <strong>Specific line changes</strong>
      <p>Paste a GitHub permalink, or enter a file and line manually.</p>
      <div className="split-fields">
        <label>
          File path or permalink
          <input
            name="filePath"
            placeholder="src/config.ts or GitHub permalink"
            value={filePath}
            onChange={(event) => updateLocation(event.target.value)}
            aria-invalid={Boolean(locationError)}
            aria-describedby={locationError ? locationErrorId : undefined}
            required
          />
          {locationError ? (
            <small className="field-error" id={locationErrorId}>
              {locationError}
            </small>
          ) : null}
        </label>
        <label>
          Line
          <input
            name="lineNumber"
            type="number"
            min="1"
            placeholder="42"
            value={lineNumber}
            onChange={(event) => setLineNumber(event.target.value)}
            required
          />
        </label>
      </div>
      <fieldset className="line-triggers">
        <legend>Notify me if the captured line is</legend>
        <label>
          <input type="checkbox" name="notifyOnRemoved" defaultChecked />
          Removed/readded
        </label>
        <label>
          <input type="checkbox" name="notifyOnMoved" defaultChecked />
          Moved
        </label>
        <label>
          <input type="checkbox" name="notifyOnChanged" defaultChecked />
          Changed
        </label>
      </fieldset>
      {triggerError ? (
        <small className="field-error" role="alert">
          {triggerError}
        </small>
      ) : null}
      <button className="button button-primary button-small" type="submit">
        Capture line
      </button>
    </form>
  );
}
