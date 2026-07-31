import * as dotenv from 'dotenv'

dotenv.config()

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const CLOUDFLARE_PROJECT_ID = process.env.CLOUDFLARE_PROJECT_ID
const CLOUDFLARE_BEARER_TOKEN = process.env.CLOUDFLARE_BEARER_TOKEN

async function getDeployments(accountId, projectId, bearerToken) {
  const deployments = []

  console.log('Fetching deployments...')

  for (let i = 1; i < 100; i++) {
    console.log(`Fetching page #${i} of deployments`)

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectId}/deployments?page=${i}`,
      {
        headers: {
          Authorization: `Bearer ${bearerToken}`
        }
      }
    )

    if (!response.ok) {
      handleError(response)
    }

    const jsonResponse = await response.json()

    if (jsonResponse.result.length === 0) {
      break
    } else {
      deployments.push(...jsonResponse.result)
    }
  }

  return deployments
}

async function deleteDeployment(
  accountId,
  projectId,
  bearerToken,
  deploymentId
) {
  console.log(`Deleting deployment with id ${deploymentId}`)

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectId}/deployments/${deploymentId}?force=true`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${bearerToken}`
      }
    }
  )

  if (!response.ok) {
    handleError(response)
  }
}

async function handleError(response) {
  throw Error(
    `There has been an error making the request to Cloudflare. Status code: ${
      response.status
    }. Error: ${await response.text()}`
  )
}

async function deleteDeployments(
  accountId,
  projectId,
  bearerToken,
  deployments
) {
  console.log('Deleting deployments...')

  const deletedDeployments = []

  deployments.forEach((deployment) => {
    if (deployment.environment === 'preview') {
      deleteDeployment(accountId, projectId, bearerToken, deployment.id)
      deletedDeployments.push(deployment.id)
    }
  })

  if (deletedDeployments.length === 0) {
    console.log('Deleted no deployments')
  } else {
    console.log(`Deleted ${deletedDeployments.length} deployments`)
    console.log(`List of deployments deleted: ${deletedDeployments}`)
  }
}

const deployments = await getDeployments(
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_PROJECT_ID,
  CLOUDFLARE_BEARER_TOKEN
)

console.log(`There are ${deployments.length} deployments`)

deleteDeployments(
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_PROJECT_ID,
  CLOUDFLARE_BEARER_TOKEN,
  deployments
)

export {}
