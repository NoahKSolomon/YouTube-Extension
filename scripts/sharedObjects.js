// Constants shared by every part of the extension. Loaded as a plain script
// before each context's own code: by the manifest for the content script, by
// importScripts in the worker, and by a <script> tag in the popup and the
// settings page.

const KEYS = {
    DEFAULT_SPEED: "playback_speed",
    INCREMENT: "increment",
    CUTOFF: "cutoff_in_seconds",
    LIVESTREAM: "enabled_for_livestream",
    SKIP_ADS: "skip_ads",
    SAVE_SPEED_CHANGES: "save_speed_changes",
    SHORTS: "enabled_for_shorts",
    RULES: "speed_rules"
};

// Chrome's supported playbackRate range. Setting 0 stalls the video, and
// anything else outside the range throws.
const MIN_SPEED = 0.0625;
const MAX_SPEED = 16;
// The range YouTube's own speed setting accepts; it caps anything else
const YOUTUBE_MIN_SPEED = 0.25;
const YOUTUBE_MAX_SPEED = 2;

const DEFAULT_SETTINGS = {
    "playback_speed": 1.0,
    "increment": 1.0,
    "cutoff_in_seconds": 0,
    "enabled_for_livestream": false,
    "skip_ads": true,
    "save_speed_changes": false,
    "enabled_for_shorts": false,
    // Each {type: "channel" | "category", value: channel id or category,
    // label: channel name (channel rules only), speed}
    "speed_rules": []
};

// YouTube's video categories, as its player data names them
const CATEGORIES = [
    "Autos & Vehicles", "Comedy", "Education", "Entertainment", "Film & Animation",
    "Gaming", "Howto & Style", "Music", "News & Politics", "Nonprofits & Activism",
    "People & Blogs", "Pets & Animals", "Science & Technology", "Sports", "Travel & Events"
];

// Events between the content script and scripts/page.js, which has its own
// copy of these names since it runs in the page's world
const PAGE_EVENTS = {
    GET_VIDEO_INFO: "ytpbs-get-video-info",
    VIDEO_INFO: "ytpbs-video-info",
    SET_YOUTUBE_SPEED: "ytpbs-set-youtube-speed"
};

const COMMANDS = {
    INCREMENT: "increment-speed",
    DECREMENT: "decrement-speed",
    SET_SPEED_1: "set-speed-1",
    SET_SPEED_DEFAULT: "set-speed-default"
};

const MESSAGES = {
    GET_SETTINGS: "getSettings",
    UPDATE_SETTINGS: "updateSettings",
    REFRESH_SETTINGS: "refreshSettings",
    GET_TAB_STATE: "getTabState",
    SET_TAB_SPEED: "setTabSpeed",
    SPEED_CHANGED: "speedChanged",
}

// Whether a channel rule is for this channel ({id, handle}). Rules added from
// the popup hold the channel id, and ones typed on the settings page may hold
// its @handle, which YouTube treats case-insensitively.
function isRuleForChannel(rule, channel) {
    return rule.type === "channel" && (rule.value === channel?.id
        || (rule.value.startsWith("@") && rule.value.toLowerCase() === channel?.handle?.toLowerCase()));
}
