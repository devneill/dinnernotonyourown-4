import { z } from 'zod'
import { requireUserId } from '#app/utils/auth.server.ts'
import { 
  getAttendeesByUserId, 
  getCurrentDinnerGroup, 
  joinDinnerGroup, 
  leaveDinnerGroup,
  getAttendeesCount
} from '#app/utils/restaurants.server.ts'

// Schema for joining a dinner group
const joinDinnerGroupSchema = z.object({
  dinnerGroupId: z.string(),
})

export async function loader({ request }: { request: Request }) {
  const userId = await requireUserId(request)
  const url = new URL(request.url)
  const action = url.searchParams.get('action')
  
  switch (action) {
    case 'list': {
      try {
        const attendees = await getAttendeesByUserId(userId)
        return { attendees }
      } catch (error) {
        console.error('Error listing attendees:', error)
        throw new Response(JSON.stringify({ error: 'Failed to list attendees' }), {
          status: 500
        })
      }
    }
    
    case 'current': {
      try {
        const currentDinnerGroup = await getCurrentDinnerGroup(userId)
        return { currentDinnerGroup }
      } catch (error) {
        console.error('Error fetching current dinner group:', error)
        throw new Response(JSON.stringify({ error: 'Failed to fetch current dinner group' }), {
          status: 500
        })
      }
    }
    
    case 'count': {
      try {
        const dinnerGroupId = url.searchParams.get('dinnerGroupId')
        if (!dinnerGroupId) {
          throw new Response(JSON.stringify({ error: 'Dinner group ID is required' }), {
            status: 400
          })
        }
        
        const count = await getAttendeesCount(dinnerGroupId)
        return { count }
      } catch (error) {
        console.error('Error counting attendees:', error)
        throw new Response(JSON.stringify({ error: 'Failed to count attendees' }), {
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
      case 'join': {
        const formDataObj = Object.fromEntries(formData.entries())
        const { dinnerGroupId } = joinDinnerGroupSchema.parse(formDataObj)
        
        const attendee = await joinDinnerGroup(userId, dinnerGroupId)
        return { attendee }
      }
      
      case 'leave': {
        const result = await leaveDinnerGroup(userId)
        return { success: !!result }
      }
      
      default:
        throw new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400
        })
    }
  } catch (error) {
    console.error('Error processing attendee action:', error)
    throw new Response(JSON.stringify({ error: 'Failed to process attendee action' }), {
      status: 500
    })
  }
} 