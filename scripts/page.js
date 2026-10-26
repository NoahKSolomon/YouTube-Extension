// Runs in the page's own JavaScript world (manifest "world": "MAIN") to read
// YouTube's player data, which the content script can't reach. The content
// script asks with a "ytpbs-get-video-info" event naming the player element,
// and this answers straight away with "ytpbs-video-info". The answer is JSON
// because objects don't cross between the two worlds.
//
// getPlayerResponse() is current as soon as YouTube opens a video in place,
// unlike the page's category meta tag and the channel link under the video.

document.addEventListener("ytpbs-get-video-info", (event) => {
    const response = document.getElementById(event.detail)?.getPlayerResponse?.();
    const details = response?.videoDetails;
    const info = details ? {
        videoId: details.videoId,
        channelId: details.channelId,
        channelName: details.author,
        category: response.microformat?.playerMicroformatRenderer?.category ?? null,
    } : null;
    document.dispatchEvent(new CustomEvent("ytpbs-video-info", {detail: JSON.stringify(info)}));
});
