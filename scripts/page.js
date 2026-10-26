// Runs in the page's own JavaScript world (manifest "world": "MAIN") to use
// YouTube's player, which the content script can't reach. The content
// script asks with a "ytpbs-get-video-info" event naming the player element,
// and this answers straight away with "ytpbs-video-info". The answer is JSON
// because objects don't cross between the two worlds.
//
// getPlayerResponse() is current as soon as YouTube opens a video in place,
// unlike the page's category meta tag and the channel link under the video.

document.addEventListener("ytpbs-get-video-info", (event) => {
    const response = document.getElementById(event.detail)?.getPlayerResponse?.();
    const details = response?.videoDetails;
    const microformat = response?.microformat?.playerMicroformatRenderer;
    const info = details ? {
        videoId: details.videoId,
        channelId: details.channelId,
        channelName: details.author,
        // From e.g. "http://www.youtube.com/@Alanwalkermusic"
        handle: microformat?.ownerProfileUrl?.match(/\/(@[^/?#]+)/)?.[1] ?? null,
        category: microformat?.category ?? null,
        // A stream that is live now; its duration is a finite rewind window
        isLive: Boolean(details.isLive),
    } : null;
    document.dispatchEvent(new CustomEvent("ytpbs-video-info", {detail: JSON.stringify(info)}));
});

// Sets the speed through YouTube's player, so its own speed menu (and its
// Shift+< / Shift+> steps) match. The content script only asks for speeds
// YouTube accepts (0.25-2x), since it caps anything else.
document.addEventListener("ytpbs-set-youtube-speed", (event) => {
    const {player, speed} = JSON.parse(event.detail);
    document.getElementById(player)?.setPlaybackRate?.(speed);
});
