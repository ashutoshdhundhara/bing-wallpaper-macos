'use strict';

const child_process = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const Jimp = require('jimp');
const url = require('url');
const qs = require('querystring');

const CURR_USER = os.userInfo().username;
const BING_MARKET = 'en-IN';
/* here idx=0 means today */
const BING_JSON_URL = `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mbl=1&mkt=${BING_MARKET}`;
const BING_WALL_DIR = `/Users/${CURR_USER}/Pictures/BingWallpapers`;
const RESOLUTION = 'UHD';

const get_bing_json = function () {
    return new Promise(function (resolve, reject) {
        https.get(BING_JSON_URL, function (response) {
            let json = '';
            response.on('data', function (data) {
                json += data;
            })
            .on('end', function () {
                resolve(JSON.parse(json));
            });
        })
        .on('error', function (error) {
            reject(error);
        });
    });
}

const get_fhd_image_url = function (image) {
    if (!image)
        return;

    const bing_base = 'https://www.bing.com';
    const image_base = image.urlbase;

    const image_url = `${bing_base}${image_base}_${RESOLUTION}.jpg`;
    return image_url;
}

/*
    image: {
        file_name: '',
        url: '',
        physical_path: '',
        copyright: ''
    }
*/
const adapt_image_meta = function (bing_json) {
    if (!bing_json)
        throw new Error('adapt: no bing json provided');

    const todays_image = bing_json.images[0];
    const fhd_url = get_fhd_image_url(todays_image);

    const file_name = qs.parse(url.parse(fhd_url).query).id;

    const image = {
        file_name: file_name,
        url: fhd_url,
        physical_path: `${BING_WALL_DIR}/${file_name}`,
        copyright: todays_image.copyright,
        title: todays_image.title
    };

    return image;
}

const download_image = function (image) {
    return new Promise(function (resolve, reject) {
        if (!image)
            return reject('download_image: no image meta provided');

        if (fs.existsSync(image.physical_path)) {
            image.exists = true;
            return resolve(image);
        }

        const file = fs.createWriteStream(image.physical_path);

        https.get(image.url, function (response) {
            response.on('data', function (chunk) {
                file.write(chunk);
            })
            .on('end', function () {
                file.end();
                resolve(image);
            });
        })
        .on('error', function (error) {
            reject(error);
        });
    });
}

const get_text_xy_coord = function (font, text) {
    const coords = {
        x: 100,
        y: 50
    };

    const text_len = Jimp.measureText(font, text);
    coords.x = 1920 - 50 - text_len;

    return coords;
}

const add_description_to_image = function (image) {
    return new Promise((resolve, reject) => {
        Jimp.loadFont(Jimp.FONT_SANS_16_BLACK)
            .then(font => {
                Jimp.read(image.physical_path)
                    .then(jimp_image => {
                        const coords = get_text_xy_coord(font, image.copyright);
                        jimp_image.print(font, coords.x, coords.y, image.copyright)
                        .write(image.physical_path, (error) => {
                            if (error)
                                return reject(error);
                            resolve(image);
                        });
                    })
            });
    });
}

const set_desktop_background = function (image) {

    // const command = `osascript -e \'tell application "Finder" to set desktop picture to POSIX file "${image.physical_path}"\'`;
    const command = `osascript -e \'tell application "System Events"
        set theDesktops to a reference to every desktop
        repeat with x from 1 to (count theDesktops)
            set picture of item x of the theDesktops to "${image.physical_path}"
        end repeat
    end tell\'`;
    return new Promise(function (resolve, reject) {

        child_process.exec(command, function (error, stdout, stderr) {
            if (error)
                return reject(error);
            return resolve(image);
        });
    });
}

const set_login_screen_background = function (file) {
    return new Promise(function (resolve, reject) {
        const lock_screen_image_path = '/Library/Caches/com.apple.desktop.admin.png';
        fs.copyFile(file.physical_path, lock_screen_image_path, function (error) {
            if (error)
                return reject(error);
            return resolve(file);
        });
    });
}

const handle_error = function (error) {
    console.error(error);
    process.exit(1);
}

const main = function () {
    get_bing_json()
        .then(adapt_image_meta)
        .then(download_image)
        //.then(add_description_to_image)
        .then(set_desktop_background)
        .then(set_login_screen_background)
        .then(image => {
            console.log(image.title);
            console.log(image.copyright);
            process.exit(1);
        })
        .catch(handle_error);
}

main();
