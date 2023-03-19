import vm from 'vm'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

class FakeBlob {
  constructor(bufs, { type }) {
    this.buffer = Buffer.concat(bufs.map(e => Buffer.from(e)))
    this.type = type
  }
}

export default async function({ Canvas, Image, ImageData, fetch, Request, Response, Headers }) {
  const threePath = fileURLToPath(await import.meta.resolve('three'))
  const document = {
    createElementNS(_, name) {
      switch (name) {
        case 'canvas':
          const c = new Canvas
          c.style = {}
          c.addEventListener = function() {}
          return c
        case 'img':
          const img = new Image
          img.addEventListener = function(eventName, cb) {
            switch (eventName) {
              case 'load':
                img.onload = cb
                break
              case 'error':
                img.onerror = cb
                break
            }
          }
          img.removeEventListener = function(eventName) {
            switch (eventName) {
              case 'load':
                delete img.onload
                break
              case 'error':
                delete img.onerror
                break
            }
          }
          return img
        default: throw `Unknown tag name: '${name}`
      }
    }
  }
  const window = {
    document,
    URL: {
      createObjectURL: blob => `data:${blob.type};base64,${blob.buffer.toString('base64')}`,
      revokeObjectURL: () => {}
    }
  }
  const vmCtx = vm.createContext({
    document,
    window,
    self: window,
    OffscreenCanvas: Canvas,
    Image,
    ImageData,
    Blob: FakeBlob,
    fetch,
    Request,
    Response,
    Headers,
    Array,
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
    BigInt64Array,
    BigUint64Array,
    Map,
    Set,
    WeakMap,
    WeakSet,
    ArrayBuffer,
    SharedArrayBuffer,
    DataView,
    setTimeout,
    setInterval,
    console
  })
  vm.runInContext(fs.readFileSync(threePath, 'utf-8'), vmCtx)
  const THREE = vm.runInContext(`THREE`, vmCtx)
  return {
    THREE,

    async loadTexture(input) {
      let tex
      if (input instanceof Canvas) {
        tex = new THREE.CanvasTexture(input)

      } else {
        let canvas

        if (input instanceof ImageData) {
          canvas = new Canvas(input.width, input.height)
          const ctx = canvas.getContext('2d')
          ctx.putImageData(input, 0, 0)

        } else if (input instanceof Image) {
          canvas = new Canvas(input.width, input.height)
          const ctx = canvas.getContext('2d')
          ctx.drawImage(input, 0, 0)

        } else if (typeof input === 'string' || input instanceof Buffer) {
          const img = await new Promise((fulfil, reject) => {
            const img = new Image()
            img.onload = () => fulfil(img)
            img.onerror = reject
            img.src = input
          })
          canvas = new Canvas(img.width, img.height)
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0)
        }

        tex = new THREE.CanvasTexture(canvas)
      }

      tex.flipY = false
      return tex
    },

    withGLTFLoader() {
      vm.runInContext(fs.readFileSync(path.join(path.dirname(path.dirname(threePath)), './examples/js/loaders/GLTFLoader.js'), 'utf-8'), vmCtx)
      const loader = new THREE.GLTFLoader()
      this.loadGLTF = f => new Promise((fulfil, reject) => {
        const buf = fs.readFileSync(f)
        loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), path.dirname(f), fulfil, reject)
      })
      return this
    }

  }
}
