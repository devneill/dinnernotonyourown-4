import { z } from 'zod'
import { requireUserId } from '#app/utils/auth.server.ts'
import { 
  getDinnerGroups, 
  getDinnerGroupById, 
  createDinnerGroup, 
  updateDinnerGroup, 
  deleteDinnerGroup 
} from '#app/utils/restaurants.server.ts'

// Schema for creating a dinner group
const createDinnerGroupSchema = z.object({
  restaurantId: z.string(),
  notes: z.string().optional(),
})

// Schema for updating a dinner group
const updateDinnerGroupSchema = z.object({
  notes: z.string().optional(),
})

export async function loader({ request }: { request: Request }) {
  await requireUserId(request)
  const url = new URL(request.url)
  const action = url.searchParams.get('action')
  
  switch (action) {
    case 'list': {
      try {
        const dinnerGroups = await getDinnerGroups()
        return { dinnerGroups }
      } catch (error) {
        console.error('Error listing dinner groups:', error)
        throw new Response(JSON.stringify({ error: 'Failed to list dinner groups' }), {
          status: 500
        })
      }
    }
    
    case 'get': {
      try {
        const id = url.searchParams.get('id')
        if (!id) {
          throw new Response(JSON.stringify({ error: 'Dinner group ID is required' }), {
            status: 400
          })
        }
        
        const dinnerGroup = await getDinnerGroupById(id)
        if (!dinnerGroup) {
          throw new Response(JSON.stringify({ error: 'Dinner group not found' }), {
            status: 404
          })
        }
        
        return { dinnerGroup }
      } catch (error) {
        console.error('Error fetching dinner group:', error)
        throw new Response(JSON.stringify({ error: 'Failed to fetch dinner group' }), {
          status: 500
        })
      }
    }
    
    default:
      throw new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400
      })
  }
}

export async function action({ request }: { request: Request }) {
  const userId = await requireUserId(request)
  
  try {
    const formData = await request.formData()
    const action = formData.get('action')
    
    switch (action) {
      case 'create': {
        const formDataObj = Object.fromEntries(formData.entries())
        const { restaurantId, notes } = createDinnerGroupSchema.parse(formDataObj)
        
        const dinnerGroup = await createDinnerGroup(restaurantId, notes)
        return { dinnerGroup }
      }
      
      case 'update': {
        const id = formData.get('id')
        if (!id || typeof id !== 'string') {
          throw new Response(JSON.stringify({ error: 'Dinner group ID is required' }), {
            status: 400
          })
        }
        
        const formDataObj = Object.fromEntries(formData.entries())
        const { notes } = updateDinnerGroupSchema.parse(formDataObj)
        
        const dinnerGroup = await updateDinnerGroup(id, { notes })
        return { dinnerGroup }
      }
      
      case 'delete': {
        const id = formData.get('id')
        if (!id || typeof id !== 'string') {
          throw new Response(JSON.stringify({ error: 'Dinner group ID is required' }), {
            status: 400
          })
        }
        
        await deleteDinnerGroup(id)
        return { success: true }
      }
      
      default:
        throw new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400
        })
    }
  } catch (error) {
    console.error('Error processing dinner group action:', error)
    throw new Response(JSON.stringify({ error: 'Failed to process dinner group action' }), {
      status: 500
    })
  }
} 