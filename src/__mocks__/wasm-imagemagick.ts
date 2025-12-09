/**
 * Mock for wasm-imagemagick module
 * wasm-imagemagick uses Web Workers which don't work in Jest/Node.js
 * This mock provides stub implementations for testing
 */

// Minimal valid 1x1 white PNG (smallest valid PNG file)
// PNG signature + IHDR chunk + IDAT chunk + IEND chunk
const MINIMAL_PNG = new Uint8Array([
  // PNG signature
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  // IHDR chunk (image header)
  0x00,
  0x00,
  0x00,
  0x0d, // chunk length (13)
  0x49,
  0x48,
  0x44,
  0x52, // "IHDR"
  0x00,
  0x00,
  0x00,
  0x01, // width: 1
  0x00,
  0x00,
  0x00,
  0x01, // height: 1
  0x08, // bit depth: 8
  0x00, // color type: grayscale
  0x00, // compression: deflate
  0x00, // filter: adaptive
  0x00, // interlace: none
  0xfa,
  0x27,
  0x9d,
  0x50, // CRC
  // IDAT chunk (image data)
  0x00,
  0x00,
  0x00,
  0x0a, // chunk length
  0x49,
  0x44,
  0x41,
  0x54, // "IDAT"
  0x78,
  0x9c,
  0x63,
  0xf8,
  0xff,
  0xff,
  0xff,
  0x00,
  0x05,
  0xfe, // compressed data (white pixel)
  0x02,
  0xfe,
  0xa6,
  0x8c, // CRC
  // IEND chunk
  0x00,
  0x00,
  0x00,
  0x00, // chunk length
  0x49,
  0x45,
  0x4e,
  0x44, // "IEND"
  0xae,
  0x42,
  0x60,
  0x82, // CRC
]);

/**
 * Mock buildInputFile function
 * Returns an object representing an input file
 */
export async function buildInputFile(
  content: Buffer | Uint8Array,
  name: string,
): Promise<{ name: string; content: Uint8Array }> {
  return {
    name,
    content: content instanceof Buffer ? new Uint8Array(content) : content,
  };
}

/**
 * Mock call function
 * Returns a mock result with appropriate output based on the output format
 */
export async function call(
  inputFiles: Array<{ name: string; content: Uint8Array }>,
  args: string[],
): Promise<{ outputFiles: Array<{ name: string; buffer: ArrayBuffer }> }> {
  // Parse dimensions from args if present (e.g., "-size", "800x480")
  let width = 800;
  let height = 480;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-size" || args[i] === "-resize") {
      const sizeMatch = args[i + 1]?.match(/(\d+)x(\d+)/);
      if (sizeMatch) {
        width = parseInt(sizeMatch[1], 10);
        height = parseInt(sizeMatch[2], 10);
      }
    }
  }

  // Determine output file name from args
  let outputName = "output.raw";
  const lastArg = args[args.length - 1];
  if (lastArg && !lastArg.startsWith("-")) {
    outputName = lastArg.replace(/^gray:/, "");
  }

  // Return PNG data for PNG output, raw grayscale otherwise
  let outputBuffer: ArrayBuffer;
  if (outputName.endsWith(".png")) {
    // Create a copy to ensure it's a regular ArrayBuffer
    outputBuffer = new ArrayBuffer(MINIMAL_PNG.length);
    new Uint8Array(outputBuffer).set(MINIMAL_PNG);
  } else {
    // Create a mock grayscale buffer (all white = 0xff)
    const bufferSize = width * height;
    outputBuffer = new ArrayBuffer(bufferSize);
    new Uint8Array(outputBuffer).fill(0xff); // White pixels
  }

  return {
    outputFiles: [
      {
        name: outputName,
        buffer: outputBuffer,
      },
    ],
  };
}

export default {
  buildInputFile,
  call,
};
