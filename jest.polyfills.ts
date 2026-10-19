import { TextEncoder, TextDecoder } from 'util'
import { ReadableStream, WritableStream, TransformStream } from 'stream/web'

const g = global as any

if (typeof g.TextEncoder === 'undefined') g.TextEncoder = TextEncoder
if (typeof g.TextDecoder === 'undefined') g.TextDecoder = TextDecoder
if (typeof g.ReadableStream === 'undefined') g.ReadableStream = ReadableStream
if (typeof g.WritableStream === 'undefined') g.WritableStream = WritableStream
if (typeof g.TransformStream === 'undefined') g.TransformStream = TransformStream

// jsdom ships Blob/File without the promise-returning readers the platform has
// had since 2019, so anything that does `await file.text()` explodes under
// test while working fine in a browser. Patch the prototype rather than
// swapping the class -- jsdom's own APIs hand back jsdom Blobs, and replacing
// the constructor makes those fail an instanceof check somewhere else.
if (
  typeof g.Blob !== 'undefined' &&
  typeof g.Blob.prototype.arrayBuffer !== 'function'
) {
  const read = (blob: Blob, as: 'buffer' | 'text') =>
    new Promise((resolve, reject) => {
      const fr = new g.FileReader()
      fr.onload = () => resolve(fr.result)
      fr.onerror = () => reject(fr.error)
      if (as === 'buffer') fr.readAsArrayBuffer(blob)
      else fr.readAsText(blob)
    })

  g.Blob.prototype.arrayBuffer = function () {
    return read(this, 'buffer')
  }
  g.Blob.prototype.text = function () {
    return read(this, 'text')
  }
}
