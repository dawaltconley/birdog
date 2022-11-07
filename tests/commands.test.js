const fsp = require('fs').promises
const path = require('path')
const { spawn } = require('child_process')

const getSample = sample =>
  fsp.readFile(path.join(__dirname, 'samples', sample + '.csv'))

const runCommand = (...args) =>
  new Promise((resolve, reject) => {
    let output = Buffer.from('')
    const source = path.resolve(__dirname, '..', 'src', 'birdog')
    const cmd = spawn(source, args)
    cmd.stdout.on('data', data => {
      output = Buffer.concat([output, data])
    })
    cmd.stderr.on('data', data => console.error(data.toString()))
    cmd.on('error', e => reject(e))
    cmd.on('close', () => resolve(output))
  })

describe('records', () => {
  describe('gets correct votes for past legislation', () => {
    test('hjres114-107', async () => {
      const [output, expected] = await Promise.all([
        runCommand('--congress', 107, '-c', 'hjres114', '-v', 'hjres114'),
        getSample('hjres114-107'),
      ])
      return expect(output).toEqual(expected)
    }, 20000)
    test('sjres46-107', async () => {
      const [output, expected] = await Promise.all([
        runCommand('--congress', 107, '-c', 'sjres46'),
        getSample('sjres46-107'),
      ])
      return expect(output).toEqual(expected)
    }, 20000)
  })
})
