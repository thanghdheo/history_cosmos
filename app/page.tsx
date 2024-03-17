"use client"; 

import { DirectSecp256k1Wallet } from '@cosmjs/proto-signing';
import { useState } from 'react';
import { Block, Event, SigningStargateClient, StargateClient } from '@cosmjs/stargate';
import { get, size, uniqBy } from 'lodash';
import { Tx } from "cosmjs-types/cosmos/tx/v1beta1/tx"

const TYPE = {
  send: 'send',
  receive: 'receive',
  seft: 'seft',
  executeContract: 'executeContract'
}

const CONSTANT: Record<string, {privateKey: string, rpc: string, prefix: string}> = {
  sei: {
    privateKey: '1538366d7547ed47ae27b0e4ad3508b242821241955251aecb5b14ffc1346439',
    rpc: 'https://rpc.wallet.pacific-1.sei.io',
    prefix: 'sei'
  },
  inj: {
    privateKey: '10310d131598da6664e630d8caca1523615e61ca8191c24938d1a627743a04df',
    rpc: 'https://injective-rpc.publicnode.com:443',
    prefix: 'inj'
  }
}

export default function Home() {

  const [history, setHistory] = useState<Record<string, any[]>>({
    sei: [],
    inj: []
  })

  const getBlockInfo = async (client: StargateClient, height: number): Promise<Block | {}> => {
    try {
      return await client.getBlock(height)
    } catch (error) {
      return {} 
    }
  }

  const getClient = async (rpc: string, privateKey: string, prefix: string): Promise<SigningStargateClient> => {
    const signer = await DirectSecp256k1Wallet.fromKey(
      Buffer.from(privateKey, 'hex'),
      prefix
    );

    const client = await SigningStargateClient.connectWithSigner(
      rpc,
      signer
    );

    return client
  }
  
  const convertArrayToObj = (events: readonly Event[], key: string, address: string) => {
    const excuteEvent = events.find(e => {
      if(key === 'transfer') return e.type === key && e.attributes.map(item => item.value).includes(address)
      return e.type === key 
    })?.attributes as any

    const eventsObj = Object.assign({}, ...(excuteEvent?.map((item: any) => ({ [item.key]: item.value }) )))

    return eventsObj
  }

  const fetchHistory = async(address: string, chain: string) => {
    try {
      //GET CLIENT
      const chainData = CONSTANT[chain]
      const client = await getClient(chainData.rpc, chainData.privateKey, chainData.prefix)

      //QUERY SEND TRANSACTION ONCHAIN OF ADDRESS
      const querySend = `message.sender = '${address}'`;
      const txsSend = await client.searchTx(querySend)

      //QUERY RECIEPT TRANSACTION ONCHAIN OF ADDRESS
      const queryReceiver = `transfer.recipient = '${address}'`;
      const txsReceiver = await client.searchTx(queryReceiver)

      const mapQueries = uniqBy(txsSend.concat(txsReceiver).sort((a, b) => b.height - a.height), 'hash')

      const txs = await Promise.all(mapQueries.map(async(item)=> {
        let block = await getBlockInfo(client, get(item, 'height'))
        const decodedTx: Tx = Tx.decode(item.tx)

        const isTransfer = item.events.map(e => e.type).includes('execute')

        let type, from, to, amount

        const eventsObj = convertArrayToObj(item.events, 'coin_spent', address)

        const feeAmount = Number(eventsObj['amount'].match( /\d+/ig)[0])
        const gasWanted =  get(item, 'gasWanted', '0')
        const gasUsed =  get(item, 'gasUsed','0')
        const gasPrice = feeAmount / ( Number(gasWanted) || 1)

        if(isTransfer){
          const eventsObj = convertArrayToObj(item.events, 'execute', address)

          type = TYPE.executeContract
          from = address
          to = eventsObj['_contract_address']
          amount = '0'
        }else{
          const eventsObj = convertArrayToObj(item.events, 'transfer', address)
          const amountDenom = eventsObj['amount'].match( /\d+/ig)

          from =  eventsObj['sender']
          to =  eventsObj['recipient']
          const isSeft = from === to
          type = isSeft ? TYPE.seft : from === address ? TYPE.send : TYPE.receive
          amount =  amountDenom[0]
        }


        return {
          type,
          amount,
          from,
          to,
          hash: get(item, 'hash', ''),
          isRawAmount: true,
          timestamp: get(block,'header.time', ''),
          status: 'success',
          gas: gasWanted,
          gasUsed,
          gasFee: feeAmount,
          gasPrice,
          input: Buffer.from(item.tx).toString('hex'),
          nonce: Number(get(decodedTx, 'authInfo.signerInfos[0].sequence', '0'))
        }
      }))

      setHistory({
        ...history,
        [chain]: txs
      })
    } catch (error) {
      throw new Error('I dont know what is wrong')
    }
  }

  return (
    <div className='grid grid-cols-2 gap-4 h-screen text-center'>
      <div className='bg-stone-500 h-full'>
          <h1>SEI HISTORY</h1>
          <input className='text-white p-2 w-[80%]' type="text" placeholder='Sei address' onChange={(e) => fetchHistory(e.target.value, 'sei')}/>
          <div className='p-4 rounded-2xl'>
            {size(history['sei']) > 0 && (
              history['sei'].map((item: any) => {
                return (
                  <div className='grid grid-cols-2 gap-4 py-2 bg-white'>
                    <div className='text-left'>
                      <p className='truncate'>{item.hash}</p>
                      <p>{item.timestamp}</p>
                    </div>
                    <div className='text-right'>
                      <p>{item.type}</p>
                      <p>{item.amount}</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
      </div>
      <div className='bg-red-200 h-full p-2'>
          <h1>INJECTIVE HISTORY</h1>
          <input className='text-white p-2 w-[80%]' type="text" placeholder='Injective address' onChange={(e) => fetchHistory(e.target.value, 'inj')}/>
          <div className='p-4 rounded-2xl'>
            {size(history['inj']) > 0 && (
              history['inj'].map((item: any) => {
                return (
                  <div className='grid grid-cols-2 gap-4 py-2 bg-white'>
                    <div className='text-left'>
                      <p className='truncate'>{item.hash}</p>
                      <p>{item.timestamp}</p>
                    </div>
                    <div className='text-right'>
                      <p>{item.type}</p>
                      <p>{item.amount}</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
      </div>
    </div>
  )
}


