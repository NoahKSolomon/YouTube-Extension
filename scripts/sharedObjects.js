export const KEYS = {
    DEFAULT_SPEED: "playback_speed",
    INCREMENT: "increment",
    CUTOFF: "cutoff_in_seconds",
    LIVESTREAM: "enabled_for_livestream"
};

export const DEFAULT_SETTINGS = {
    "playback_speed": 1.0,
    "increment": 1.0,
    "cutoff_in_seconds": 0,
    "enabled_for_livestream": false
};

export const COMMANDS = {
    INCREMENT: "increment-speed",
    DECREMENT: "decrement-speed",
    SET_SPEED_1: "set-speed-1",
    SET_SPEED_DEFAULT: "set-speed-default"
};

export const MESSAGES = {
    GET_ALL_CONFIGS: "getAllConfigs",
    UPDATE_SETTINGS: "updateSettings",
    REFRESH_SETTINGS: "refreshSettings",
}