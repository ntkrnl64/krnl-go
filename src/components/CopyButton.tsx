import { useState } from "react";
import { Button, Tooltip } from "@fluentui/react-components";
import { CheckmarkRegular, CopyRegular } from "@fluentui/react-icons";

export default function CopyButton({
  text,
  size = "small",
}: {
  text: string;
  size?: "small" | "medium" | "large";
}) {
  const [copied, setCopied] = useState(false);

  function doCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Tooltip content={copied ? "Copied!" : "Copy link"} relationship="label">
      <Button
        size={size}
        appearance="subtle"
        icon={copied ? <CheckmarkRegular /> : <CopyRegular />}
        onClick={doCopy}
      />
    </Tooltip>
  );
}
