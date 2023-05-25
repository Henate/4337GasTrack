import { ethers } from 'hardhat'
import {
  EntryPoint,
  EntryPointPis,
  EntryPoint__factory,
  SimpleAccountFactory,
  SimpleAccount,
  SimpleAccount__factory,
  TestCounter,
  TestCounter__factory,
  TestToken__factory,
  TestToken,
  EntryPointPis__factory,
} from '../typechain-types'
import {
  createAccount,
  createAccountOwner,
  createAddress,
  fund,
  rethrow,
  simulationResultCatch,
} from './testutils'
import { PopulatedTransaction, Signer, Wallet } from 'ethers'
import { expect } from 'chai'
import { fillAndSign } from './UserOp'
import { UserOperationStruct } from 'userop/dist/typechain/EntryPoint'

async function generateBatchofERC20TransferOp(
  signer: Signer,
  token: TestToken,
  entryPoint: any,
  adminAccount: SimpleAccount,
  testLoop: number,
  oldAccount?: Wallet,
  oldAccountFactory?: SimpleAccountFactory
) {
  let erc20TransfercallData: PopulatedTransaction
  let account: SimpleAccount
  let accountFactory: SimpleAccountFactory
  //const signer = ethers.provider.getSigner()
  const accountOwner = oldAccount ?? createAccountOwner()

  const transfercallData = await token.populateTransaction.transfer(
    accountOwner.address,
    100 * (testLoop + 1)
  )

  erc20TransfercallData = await adminAccount.populateTransaction.execute(
    token.address,
    0,
    transfercallData.data!
  )
  ;({ proxy: account, accountFactory: accountFactory } = await createAccount(
    signer,
    await accountOwner.getAddress(),
    entryPoint.address,
    oldAccountFactory
  ))

  await fund(account.address)
  await token.mint(account.address, 100000)
  //console.log('account deployed to:', account.address)

  const op = await fillAndSign(
    {
      callData: erc20TransfercallData.data,
      sender: account.address,
      callGasLimit: 2e6,
      verificationGasLimit: 2e6,
    },
    accountOwner,
    entryPoint
  )
  // console.log('loop:', testLoop, 'toOwner:', accountOwner.address)
  return { op, accountOwner, account, accountFactory }
}

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

describe('handle ERC20 token with 4337 solution', () => {
  let entryPoint: EntryPoint
  let entryPointPis: EntryPointPis
  const ethersSigners = ethers.provider.getSigner()
  let accountOwner: Wallet
  let refundAccount: Wallet
  let account: SimpleAccount
  let token: TestToken
  let beneficiaryAddress: string
  let simpleAccountFactory: SimpleAccountFactory
  let gasFirst: number
  let gasSecond: number
  const testLoopLimit = 1
  const accountOwners: Wallet[] = []
  const accountFactorys: SimpleAccountFactory[] = []

  before(async () => {
    accountOwner = createAccountOwner()
    beneficiaryAddress = createAddress()
    refundAccount = createAccountOwner()
    entryPoint = await new EntryPoint__factory(ethersSigners).deploy()
    entryPointPis = await new EntryPointPis__factory(ethersSigners).deploy()
    account = await new SimpleAccount__factory(ethersSigners).deploy(
      entryPoint.address
    )
    token = await new TestToken__factory(ethersSigners).deploy()
  })

  it('handle ERC20 mint Op', async () => {
    let execcallData: PopulatedTransaction
    let ERCaccount: SimpleAccount

    const mintcallData = await token.populateTransaction.mint(
      beneficiaryAddress,
      1000
    )

    execcallData = await account.populateTransaction.execute(
      token.address,
      0,
      mintcallData.data!
    )
    ;({ proxy: ERCaccount } = await createAccount(
      ethersSigners,
      await accountOwner.getAddress(),
      entryPoint.address
    ))

    console.log('AA deployed to:', ERCaccount.address)

    await fund(ERCaccount.address)

    const op = await fillAndSign(
      {
        callData: execcallData.data,
        sender: ERCaccount.address,
        callGasLimit: 2e6,
        verificationGasLimit: 1e6,
      },
      accountOwner,
      entryPoint
    )

    await entryPoint.callStatic
      .simulateValidation(op, { gasPrice: 1e9 })
      .catch(simulationResultCatch)

    const tx = await entryPoint
      .handleOps([op], accountOwner.address)
      .catch(rethrow())
      .then(async (r) => r!.wait())

    console.log('mint gasused:', tx.gasUsed.toString())
    const balance = await token.balanceOf(beneficiaryAddress)
    expect(balance).to.equal(1000)
    console.log('mint benefi address balance:', balance.toString())
  })

  it('handle ERC20 transfer Op for one time', async () => {
    let erc20TransfercallData: PopulatedTransaction
    let ercAccount: SimpleAccount

    const transfercallData = await token.populateTransaction.transfer(
      beneficiaryAddress,
      100
    )

    erc20TransfercallData = await account.populateTransaction.execute(
      token.address,
      0,
      transfercallData.data!
    )
    ;({ proxy: ercAccount } = await createAccount(
      ethersSigners,
      await accountOwner.getAddress(),
      entryPoint.address
    ))
    console.log('AA account deployed to:', ercAccount.address)

    await fund(ercAccount.address)
    await token.mint(ercAccount.address, 500)

    const op = await fillAndSign(
      {
        callData: erc20TransfercallData.data,
        sender: ercAccount.address,
        callGasLimit: 2e6,
        verificationGasLimit: 1e6,
      },
      accountOwner,
      entryPoint
    )

    await entryPoint.callStatic
      .simulateValidation(op, { gasPrice: 1e9 })
      .catch(simulationResultCatch)

    const tx = await entryPoint
      .handleOps([op], accountOwner.address)
      .then(async (r) => r!.wait())

    console.log('transfer gasused:', tx.gasUsed.toString())
    const balance = await token.balanceOf(beneficiaryAddress)
    console.log('transfer benefi address balance:', balance.toString())
    expect(balance).to.equal(1100)
  })

  it('[Gas Trace] - 1st handle batch of ERC20 transfer Ops', async () => {
    const ops: UserOperationStruct[] = []
    let accountFactory: SimpleAccountFactory

    for (let testLoop = 0; testLoop < testLoopLimit; testLoop++) {
      const { op, accountOwner, accountFactory } =
        await generateBatchofERC20TransferOp(
          ethersSigners,
          token,
          entryPoint,
          account,
          testLoop
        )
      ops.push(op)
      accountOwners.push(accountOwner)
      accountFactorys.push(accountFactory)
    }

    //console.log('op', ops[0])
    // // mark for temp
    // ops.map((op) =>
    //   entryPoint.callStatic
    //     .simulateValidation(op, { gasPrice: 1e9 })
    //     .catch(simulationResultCatch)
    // )

    const tx = await entryPoint
      .handleOps(ops, refundAccount.address, {
        maxFeePerGas: 1e9,
        maxPriorityFeePerGas: 1e9,
      })
      .then(async (t) => await t.wait())

    console.log(
      'batch transfer gasused:',
      tx.gasUsed.toString(),
      'avgGas:',
      tx.gasUsed.div(testLoopLimit).toString()
    )

    gasFirst = tx.gasUsed.toNumber()

    for (let testloop = 0; testloop < testLoopLimit; testloop++) {
      const balance = await token.balanceOf(accountOwners[testloop].address)
      // console.log(
      //   'account:',
      //   accountOwners[testloop].address,
      //   'balance:',
      //   balance.toString()
      // )
      expect(balance).to.equal((testloop + 1) * 100)
    }
  })

  it('[Gas Trace] - 2th handle batch of ERC20 transfer Ops', async () => {
    const ops: UserOperationStruct[] = []

    for (let testLoop = 0; testLoop < testLoopLimit; testLoop++) {
      const { op, accountOwner } = await generateBatchofERC20TransferOp(
        ethersSigners,
        token,
        entryPoint,
        account,
        testLoop,
        accountOwners[testLoop],
        accountFactorys[testLoop]
      )
      ops.push(op)
      //accountOwners.push(accountOwner)
    }
    //// mark for temp
    // ops.map((op) =>
    //   entryPoint.callStatic
    //     .simulateValidation(op, { gasPrice: 1e9 })
    //     .catch(simulationResultCatch)
    // )

    const tx = await entryPoint
      .handleOps(ops, refundAccount.address, {
        maxFeePerGas: 1e9,
        maxPriorityFeePerGas: 1e9,
      })
      .then(async (t) => await t.wait())

    console.log(
      'batch transfer gasused:',
      tx.gasUsed.toString(),
      'avgGas:',
      tx.gasUsed.div(testLoopLimit).toString()
    )
  })

  // it('[Gas Trace] Pis modification: handle batch of ERC20 transfer Ops', async () => {
  //   const ops: UserOperationStruct[] = []
  //   const accountOwners: Wallet[] = []

  //   for (let testLoop = 0; testLoop < testLoopLimit; testLoop++) {
  //     const { op, accountOwner } = await generateBatchofERC20TransferOp(
  //       ethersSigners,
  //       token,
  //       entryPointPis,
  //       account,
  //       testLoop
  //     )
  //     ops.push(op)
  //     accountOwners.push(accountOwner)
  //   }
  //   //console.log('op', ops[0])

  //   ops.map((op) =>
  //     entryPointPis.callStatic
  //       .simulateValidation(op, { gasPrice: 1e9 })
  //       .catch(simulationResultCatch)
  //   )
  //   const tx = await entryPointPis
  //     .handleOps(ops, {
  //       maxFeePerGas: 1e9,
  //       maxPriorityFeePerGas: 1e9,
  //     })
  //     .then(async (t) => await t.wait())

  //   gasSecond = tx.gasUsed.toNumber()

  //   console.log(
  //     'Pis modification: batch transfer gasused:',
  //     tx.gasUsed.toString(),
  //     'avgGas:',
  //     tx.gasUsed.div(testLoopLimit).toString()
  //   )
  //   for (let testloop = 0; testloop < testLoopLimit; testloop++) {
  //     const balance = await token.balanceOf(accountOwners[testloop].address)
  //     // console.log(
  //     //   'account:',
  //     //   accountOwners[testloop].address,
  //     //   'balance:',
  //     //   balance.toString()
  //     // )
  //     expect(balance).to.equal((testloop + 1) * 100)
  //   }
  // })

  // it('compare gas difference', async () => {
  //   console.log('gasFirst:', gasFirst, 'gasSecond:', gasSecond)
  //   console.log(
  //     'gasdiff:',
  //     gasFirst - gasSecond,
  //     'gasdiff%:',
  //     (gasFirst - gasSecond) / gasFirst
  //   )
  //   expect(gasFirst).to.be.greaterThan(gasSecond)
  // })
})

// describe('ContractGSY', () => {
//   let token: ContractGSY
//   const initialSupply = 1_000_000_000
//   const tokenCap = 2_000_000_000

//   const ownerSigner = ethers.provider.getSigner()
//   const toSigner = ethers.provider.getSigner(1)

//   before(async () => {
//     token = await new ContractGSY__factory(ownerSigner).deploy(
//       initialSupply,
//       tokenCap
//     )
//   })

//   it('check totalSupply match our setting', async () => {
//     const balanceOwner = await token.balanceOf(ownerSigner.getAddress())
//     expect(balanceOwner).to.equal(initialSupply)
//   })

//   it('transfer 1000 token to another account', async () => {
//     console.log(
//       'transfer estimateGas:',
//       await token.estimateGas
//         .transfer(toSigner.getAddress(), 1000, {
//           maxFeePerGas: 1e9,
//           gasLimit: 1e7,
//         })
//         .then((gas) => gas.toString())
//     )

//     const rcpt = await token
//       .transfer(toSigner.getAddress(), 1000)
//       .then((tx) => tx.wait())
//     console.log('transfer gasUsed:', rcpt.gasUsed.toString())

//     const balanceTo = await token.balanceOf(toSigner.getAddress())
//     expect(balanceTo).to.equal(1000)
//   })
// })
