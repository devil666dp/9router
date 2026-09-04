"use client";

// One field, shared by every "add/edit a provider node" form, so the wording and
// the accepted values are identical everywhere and a logo added on one screen
// looks the same on the next.

import PropTypes from "prop-types";
import Input from "./Input";
import ProviderIcon from "./ProviderIcon";
import { safeLogoUrl } from "@/shared/utils/logoUrl";

export default function LogoUrlInput({ value, onChange, fallbackText = "?", fallbackColor }) {
  const preview = safeLogoUrl(value);

  return (
    <div className="flex items-end gap-3">
      <Input
        label="Logo URL (optional)"
        value={value ?? ""}
        onChange={onChange}
        placeholder="https://acme.ai/logo.png"
        hint="Shown instead of the generic icon. Leave blank to keep the default."
        className="min-w-0 flex-1"
      />
      <div
        className="mb-[1.375rem] grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2"
        title={preview ? "Preview" : "No logo yet"}
      >
        <ProviderIcon
          src={preview || undefined}
          alt="Logo preview"
          size={32}
          className="max-h-8 max-w-8 rounded-lg object-contain"
          fallbackText={fallbackText}
          fallbackColor={fallbackColor}
        />
      </div>
    </div>
  );
}

LogoUrlInput.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  fallbackText: PropTypes.string,
  fallbackColor: PropTypes.string,
};
