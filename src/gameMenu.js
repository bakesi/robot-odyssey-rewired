import './gameMenu.css'

export const States = {
    SPLASH: 0,
    MENU_TRANSITION: 1,
    MENU_ACTIVE: 2,
    EXEC_LAUNCHING: 3,
    EXEC: 4,
    LOADING: 5,
    ERROR: 6,
};

const splash = document.getElementById('splash');
const loading = document.getElementById('loading');
const framebuffer = document.getElementById('framebuffer');
const error = document.getElementById('error');
const game_menu = document.getElementById('game_menu');
const game_menu_cursor = document.getElementById('game_menu_cursor');
const choices = Array.from(game_menu.getElementsByClassName("choice"));

let current_state = null;
let current_menu_choice = 0;
let menu_joystick_interval = null;
let menu_joystick_y = 0;
let menu_joystick_accum = 0;

export function showError(e)
{
    e = e.toString();
    if (e.includes("no binaryen method succeeded")) {
        // This is obtuse; we only build for wasm, so really this means the device doesn't support wasm
        e = "No WebAssembly?\n\nSorry, this browser might not be supported.";
    } else {
        // Something else went wrong.
        e = "Fail.\n\n" + e;
    }

    error.innerText = e;
    setState(States.ERROR);
}

export function init(engine)
{
    // Splashscreen pointing events
    splash.addEventListener('mousedown', function () {
        if (current_state == States.SPLASH) {
            setState(States.MENU_TRANSITION);
        }
    });
    splash.addEventListener('touchstart', function () {
        if (current_state == States.SPLASH) {
            setState(States.MENU_TRANSITION);
        }
    });

    // Splash animation end
    getLastSplashImage().addEventListener('animationend', function () {
        setTimeout(function () {
            if (current_state == States.SPLASH) {
                setState(States.MENU_TRANSITION);
            }
        }, 1000);
    });

    // Mouse/touch handlers for menu choices
    for (let i = 0; i < choices.length; i++) {
        choices[i].addEventListener('click', function () {
            if (current_state == States.MENU_ACTIVE) {
                setMenuChoice(i);
                execMenuChoice(engine);
            }
        })
        choices[i].addEventListener('mouseenter', function () {
            if (current_state == States.MENU_ACTIVE && menu_joystick_y == 0) {
                setMenuChoice(i);
            }
        })
    }

    // Back to the menu when a game binary exits
    engine.onProcessExit = function () {
        setState(States.MENU_TRANSITION);
    };

    // We're already running the splashscreen via CSS animations
    setState(States.SPLASH);
}

export function pressKey(engine, ascii, scancode)
{
    if (current_state == States.SPLASH) {
        setState(States.MENU_TRANSITION);

    } else if (current_state == States.MENU_ACTIVE) {

        if (scancode == 0x50 || ascii == 0x20) {
            // Down or Space
            setMenuChoice(current_menu_choice + 1);
        } else if (scancode == 0x48) {
            // Up
            setMenuChoice(current_menu_choice - 1);
        } else if (ascii == 0x0D) {
            // Enter
            execMenuChoice(engine);
        }
    }
}

export function setJoystickAxes(engine, x, y)
{
    x = Math.max(-1, Math.min(1, x));
    y = Math.max(-1, Math.min(1, y));

    if (current_state == States.MENU_ACTIVE) {
        menu_joystick_y = y;

        if (y == 0) {
            // Reset on idle
            menu_joystick_accum = 0;
            if (menu_joystick_interval) {
                clearInterval(menu_joystick_interval);
                menu_joystick_interval = null;
            }
        }

        // Variable repeat rate
        const interval = 100;
        const exponent = 2.5;

        if (!menu_joystick_interval) {
            menu_joystick_interval = setInterval(function () {
                const rate = Math.pow(Math.abs(menu_joystick_y), exponent) * Math.sign(menu_joystick_y);
                menu_joystick_accum += rate;
                let intpart = menu_joystick_accum|0;
                if (intpart != 0) {
                    menu_joystick_accum -= intpart;
                    setMenuChoice(current_menu_choice + intpart);
                }
            }, interval);
        }
    }
}

export function setJoystickButton(engine, b)
{
    if (b && current_state == States.SPLASH) {
        setState(States.MENU_TRANSITION);
    } else if (b && current_state == States.MENU_ACTIVE) {
        execMenuChoice(engine);
    }
}

export function afterLoading(engine, func)
{
    if (engine.calledRun) {
        // Already loaded
        func();
    } else {
        setState(States.LOADING);
        engine.then(func);
    }
}

function getLastSplashImage()
{
    let result = null;
    for (let child of Array.from(splash.children)) {
        if (child.nodeName == 'IMG') {
            result = child;
        }
    }
    return result;
}

export function setState(s)
{
    if (s == current_state) {
        return;
    }
    if (current_state == States.ERROR) {
        // Stay stuck in error state
        return;
    }
    current_state = s;

    if (menu_joystick_interval) {
        clearInterval(menu_joystick_interval);
        menu_joystick_interval = null;
    }

    if (s == States.MENU_TRANSITION) {
        // Brief timed state to lock out input when menu is fading in
        setTimeout(function () {
            if (current_state == States.MENU_TRANSITION) {
                setState(States.MENU_ACTIVE);
            }
        }, 300);
    }

    if (s == States.ERROR) {
        error.classList.remove('hidden');
    } else {
        error.classList.add('hidden');
    }

    if (s == States.SPLASH) {
        splash.classList.remove('hidden');
    } else if (s == States.ERROR || s == States.LOADING || s == States.EXEC_LAUNCHING) {
        splash.classList.add('hidden');
    }

    if (s == States.EXEC_LAUNCHING) {
        game_menu.classList.add('fadeout');
    } else if (s != States.EXEC && s != States.LOADING) {
        game_menu.classList.remove('fadeout');
    }

    if (s == States.MENU_TRANSITION || s == States.MENU_ACTIVE) {
        game_menu.classList.remove('hidden');
    } else if (s == States.ERROR) {
        game_menu.classList.add('hidden');
    }

    if (s == States.LOADING) {
        loading.classList.remove('hidden');
    } else if (s != States.EXEC) {
        loading.classList.add('hidden');
    }

    if (s == States.EXEC) {
        framebuffer.classList.remove('hidden');
    } else {
        framebuffer.classList.add('hidden');
    }
}

function setMenuChoice(c)
{
    c %= choices.length;
    if (c < 0) c += choices.length;

    if (c != current_menu_choice) {
        current_menu_choice = c;
    }

    // The cursor's default positioning is aligned with the first choice.
    // Adjust the cursor offset based on the choice position.

    let element = choices[c];
    let to_percent = 100 / element.offsetParent.offsetHeight;
    let offset_percent = (element.offsetTop - choices[0].offsetTop) * to_percent;
    game_menu_cursor.style.top = offset_percent + '%';
}

function execMenuChoice(engine)
{
    // Sequence of operations:
    //   1. Menu fades out immediately, we enter States.EXEC_LAUNCHING
    //   2. If the WASM needs to load, it does so with the spinner visible
    //   3. The game will take a small amount of time between exec() and the first frame
    //   4. At the first frame, we setState(EXEC) and show the game with an iris transition

    const args = choices[current_menu_choice].dataset.exec.split(" ");
    afterLoading(engine, function () {
        setState(States.EXEC_LAUNCHING);
        engine.exec(args[0], args[1] || "");
    });
}
