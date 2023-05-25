import { Wallet, BigNumber, Contract, Signer } from 'ethers'
import {
  BytesLike,
  arrayify,
  hexConcat,
  keccak256,
  parseEther,
} from 'ethers/lib/utils'
import { ethers } from 'hardhat'
import {
  SimpleAccount,
  SimpleAccountFactory,
  SimpleAccountFactory__factory,
  SimpleAccount__factory,
} from '../typechain-types'

export const AddressZero = ethers.constants.AddressZero

const panicCodes: { [key: number]: string } = {
  // from https://docs.soliditylang.org/en/v0.8.0/control-structures.html
  0x01: 'assert(false)',
  0x11: 'arithmetic overflow/underflow',
  0x12: 'divide by zero',
  0x21: 'invalid enum value',
  0x22: 'storage byte array that is incorrectly encoded',
  0x31: '.pop() on an empty array.',
  0x32: 'array sout-of-bounds or negative index',
  0x41: 'memory overflow',
  0x51: 'zero-initialized variable of internal function type',
}

let counter = 0

export function createAccountOwner(): Wallet {
  const privateKey = keccak256(Buffer.from(arrayify(BigNumber.from(++counter))))
  //console.log('create new account')
  return new ethers.Wallet(privateKey, ethers.provider)
  // return new ethers.Wallet('0x'.padEnd(66, privkeyBase), ethers.provider);
}

export function createAddress(): string {
  return createAccountOwner().address
}

export async function fund(
  contractOrAddress: string | Contract,
  amountEth = '1'
): Promise<void> {
  let address: string
  if (typeof contractOrAddress === 'string') {
    address = contractOrAddress
  } else {
    address = contractOrAddress.address
  }
  await ethers.provider
    .getSigner()
    .sendTransaction({ to: address, value: parseEther(amountEth) })
}

// given the parameters as AccountDeployer, return the resulting "counterfactual address" that it would create.
export async function getAccountAddress(
  owner: string,
  factory: SimpleAccountFactory,
  salt = 0
): Promise<string> {
  return await factory.getAddress(owner, salt)
}

// rethrow "cleaned up" exception.
// - stack trace goes back to method (or catch) line, not inner provider
// - attempt to parse revert data (needed for geth)
// use with ".catch(rethrow())", so that current source file/line is meaningful.
export function rethrow(): (e: Error) => void {
  const callerStack = new Error()
    .stack!.replace(/Error.*\n.*at.*\n/, '')
    .replace(/.*at.* \(internal[\s\S]*/, '')

  if (arguments[0] != null) {
    throw new Error('must use .catch(rethrow()), and NOT .catch(rethrow)')
  }
  return function (e: Error) {
    const solstack = e.stack!.match(/((?:.* at .*\.sol.*\n)+)/)
    const stack = (solstack != null ? solstack[1] : '') + callerStack
    // const regex = new RegExp('error=.*"data":"(.*?)"').compile()
    const found = /error=.*?"data":"(.*?)"/.exec(e.message)
    let message: string
    if (found != null) {
      const data = found[1]
      message =
        decodeRevertReason(data) ?? e.message + ' - ' + data.slice(0, 100)
    } else {
      message = e.message
    }
    const err = new Error(message)
    err.stack = 'Error: ' + message + '\n' + stack
    throw err
  }
}

export function decodeRevertReason(
  data: string,
  nullIfNoMatch = true
): string | null {
  const methodSig = data.slice(0, 10)
  const dataParams = '0x' + data.slice(10)

  if (methodSig === '0x08c379a0') {
    const [err] = ethers.utils.defaultAbiCoder.decode(['string'], dataParams)
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    return `Error(${err})`
  } else if (methodSig === '0x00fa072b') {
    const [opindex, paymaster, msg] = ethers.utils.defaultAbiCoder.decode(
      ['uint256', 'address', 'string'],
      dataParams
    )
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    return `FailedOp(${opindex}, ${
      paymaster !== AddressZero ? paymaster : 'none'
    }, ${msg})`
  } else if (methodSig === '0x4e487b71') {
    const [code] = ethers.utils.defaultAbiCoder.decode(['uint256'], dataParams)
    return `Panic(${panicCodes[code] ?? code} + ')`
  }
  if (!nullIfNoMatch) {
    return data
  }
  return null
}

// helper function to create the initCode to deploy the account, using our account factory.
export function getAccountInitCode(
  owner: string,
  factory: SimpleAccountFactory,
  salt = 0
): BytesLike {
  return hexConcat([
    factory.address,
    factory.interface.encodeFunctionData('createAccount', [owner, salt]),
  ])
}

// Deploys an implementation and a proxy pointing to this implementation
export async function createAccount(
  ethersSigner: Signer,
  accountOwner: string,
  entryPoint: string,
  _factory?: SimpleAccountFactory
): Promise<{
  proxy: SimpleAccount
  accountFactory: SimpleAccountFactory
  implementation: string
}> {
  const accountFactory =
    _factory ??
    (await new SimpleAccountFactory__factory(ethersSigner).deploy(entryPoint))
  const implementation = await accountFactory.accountImplementation()
  await accountFactory.createAccount(accountOwner, 0)
  const accountAddress = await accountFactory.getAddress(accountOwner, 0)
  const proxy = SimpleAccount__factory.connect(accountAddress, ethersSigner)
  return {
    implementation,
    accountFactory,
    proxy,
  }
}

/**
 * process exception of ValidationResult
 * usage: entryPoint.simulationResult(..).catch(simulationResultCatch)
 */
export function simulationResultCatch(e: any): any {
  if (e.errorName !== 'ValidationResult') {
    throw e
  }
  return e.errorArgs
}
