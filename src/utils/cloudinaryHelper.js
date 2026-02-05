/**
 * Extracts the Cloudinary public ID from a given URL.
 * Handles standard Cloudinary URLs including those with version numbers.
 * 
 * Example:
 * Input: https://res.cloudinary.com/demo/image/upload/v1570979139/folder/sample.jpg
 * Output: folder/sample
 * 
 * @param {string} url - The complete Cloudinary image URL
 * @returns {string|null} - The public ID or null if extraction fails
 */
const extractPublicIdFromUrl = (url) => {
    try {
        if (!url) return null;

        // Regex to match:
        // 1. /upload/
        // 2. Optional version: (v\d+/)?
        // 3. Capture group for public ID: (.*)
        // 4. \. dot and extension at the end
        const regex = /\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/;
        const match = url.match(regex);

        if (match && match[1]) {
            return match[1];
        }
        return null;

    } catch (error) {
        console.error('Error extracting public ID from URL:', error);
        return null;
    }
};

module.exports = { extractPublicIdFromUrl };
