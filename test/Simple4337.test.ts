import { ethers } from 'hardhat'
import {
  EntryPoint,
  EntryPoint__factory,
  SimpleAccountFactory,
  SimpleAccount,
  SimpleAccount__factory,
  TestCounter,
  TestCounter__factory,
} from '../typechain-types'
import {
  createAccount,
  createAccountOwner,
  createAddress,
  fund,
  rethrow,
  simulationResultCatch,
} from './testutils'
import { PopulatedTransaction, Wallet } from 'ethers'
import { expect } from 'chai'
import { fillAndSign } from './UserOp'

describe('SimpleAccount', () => {
  let entryPoint: EntryPoint
  const ethersSigners = ethers.provider.getSigner()
  let accountOwner: Wallet
  let account: SimpleAccount
  let simpleAccountFactory: SimpleAccountFactory

  before(async () => {
    accountOwner = createAccountOwner()

    // TODO: add EntryPoint constructor for our new EP
    entryPoint = await new EntryPoint__factory(ethersSigners).deploy()

    // note: or... we could use UsrOp to create account
    account = await new SimpleAccount__factory(ethersSigners).deploy(
      entryPoint.address
    )
    await fund(accountOwner.address)
  })

  it('check contract is deployed', async () => {
    expect(
      await ethers.provider.getCode(entryPoint.address).then((x) => x.length)
    ).to.be.greaterThan(2)
    expect(
      await ethers.provider.getCode(account.address).then((x) => x.length)
    ).to.be.greaterThan(2)

    console.log('EntryPoint deployed to:', entryPoint.address)
    console.log('Account deployed to:', account.address)
  })

  describe('test handle ops', () => {
    let counter: TestCounter
    let accountExecCounterFromEntryPoint: PopulatedTransaction
    let account2: SimpleAccount
    const accountOwner2 = createAccountOwner()
    const beneficiaryAddress = createAddress()

    before(async () => {
      counter = await new TestCounter__factory(ethersSigners).deploy()
      console.log('TestCounter deployed to:', counter.address)
    })

    it('new account handleOp, first time', async () => {
      const count = await counter.populateTransaction.count()

      accountExecCounterFromEntryPoint =
        await account.populateTransaction.execute(
          counter.address,
          0,
          count.data!
        )
      ;({ proxy: account2 } = await createAccount(
        ethersSigners,
        await accountOwner2.getAddress(),
        entryPoint.address
      ))
      console.log('account2 deployed to:', account2.address)

      await fund(account2.address)

      const op = await fillAndSign(
        {
          callData: accountExecCounterFromEntryPoint.data,
          sender: account2.address,
          callGasLimit: 2e6,
          verificationGasLimit: 1e6,
        },
        accountOwner2,
        entryPoint
      )

      await entryPoint.callStatic
        .simulateValidation(op, { gasPrice: 1e9 })
        .catch(simulationResultCatch)

      //await fund(account2.address)
      const tx = await entryPoint
        .handleOps([op], beneficiaryAddress)
        .catch(rethrow())
        .then(async (r) => r!.wait())

      console.log('gasused:', tx.gasUsed.toString())

      //console.log('counter:', await counter.counters(account2.address))
      expect(
        await ethers.provider.getCode(counter.address).then((x) => x.length)
      ).to.be.greaterThan(2)

      expect(await counter.counters(account2.address)).to.equal(1)
    })

    it('new account handleOp, second time', async () => {
      const count = await counter.populateTransaction.count()

      accountExecCounterFromEntryPoint =
        await account.populateTransaction.execute(
          counter.address,
          0,
          count.data!
        )
      ;({ proxy: account2 } = await createAccount(
        ethersSigners,
        await accountOwner2.getAddress(),
        entryPoint.address
      ))
      console.log('account22 deployed to:', account2.address)

      await fund(account2.address)

      const op = await fillAndSign(
        {
          callData: accountExecCounterFromEntryPoint.data,
          sender: account2.address,
          callGasLimit: 2e6,
          verificationGasLimit: 1e6,
        },
        accountOwner2,
        entryPoint
      )

      await entryPoint.callStatic
        .simulateValidation(op, { gasPrice: 1e9 })
        .catch(simulationResultCatch)

      //await fund(account2.address)
      const tx = await entryPoint
        .handleOps([op], beneficiaryAddress)
        .catch(rethrow())
        .then(async (r) => r!.wait())

      console.log('gasused:', tx.gasUsed.toString())

      //console.log('counter:', await counter.counters(account2.address))
      expect(
        await ethers.provider.getCode(counter.address).then((x) => x.length)
      ).to.be.greaterThan(2)

      expect(await counter.counters(account2.address)).to.equal(1)
    })
  })
})
