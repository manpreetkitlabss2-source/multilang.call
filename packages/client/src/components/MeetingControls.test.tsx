import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MeetingControls from "./MeetingControls";

describe("MeetingControls", () => {
  it("renders mute and leave actions", () => {
    const onToggleMute = vi.fn();
    const onToggleVideo = vi.fn();
    const onLanguageChange = vi.fn();
    const onLeave = vi.fn();

    render(
      <MeetingControls
        isMuted={false}
        isVideoEnabled
        preferredLanguage="en"
        onToggleMute={onToggleMute}
        onToggleVideo={onToggleVideo}
        onLanguageChange={onLanguageChange}
        onLeave={onLeave}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /mute microphone/i }));
    fireEvent.click(screen.getByRole("button", { name: /turn video off/i }));
    fireEvent.click(screen.getByRole("button", { name: /leave meeting/i }));

    expect(onToggleMute).toHaveBeenCalledTimes(1);
    expect(onToggleVideo).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
