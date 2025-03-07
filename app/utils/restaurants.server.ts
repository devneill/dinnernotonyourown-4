import  { type Restaurant } from '@prisma/client'
import { prisma } from './db.server.ts'

// Restaurant queries
export async function getRestaurants() {
  return prisma.restaurant.findMany({
    include: {
      dinnerGroups: {
        include: {
          attendees: true,
        },
      },
    },
  })
}

export async function getRestaurantById(id: string) {
  return prisma.restaurant.findUnique({
    where: { id },
    include: {
      dinnerGroups: {
        include: {
          attendees: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  name: true,
                  image: true,
                },
              },
            },
          },
        },
      },
    },
  })
}

export async function createRestaurant(restaurantData: Omit<Restaurant, 'id' | 'createdAt' | 'updatedAt'>) {
  return prisma.restaurant.create({
    data: restaurantData,
  })
}

export async function updateRestaurant(id: string, restaurantData: Partial<Omit<Restaurant, 'id' | 'createdAt' | 'updatedAt'>>) {
  return prisma.restaurant.update({
    where: { id },
    data: restaurantData,
  })
}

export async function deleteRestaurant(id: string) {
  return prisma.restaurant.delete({
    where: { id },
  })
}

// Dinner Group queries
export async function getDinnerGroups() {
  return prisma.dinnerGroup.findMany({
    include: {
      restaurant: true,
      attendees: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
              image: true,
            },
          },
        },
      },
    },
  })
}

export async function getDinnerGroupById(id: string) {
  return prisma.dinnerGroup.findUnique({
    where: { id },
    include: {
      restaurant: true,
      attendees: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
              image: true,
            },
          },
        },
      },
    },
  })
}

export async function createDinnerGroup(restaurantId: string, notes?: string) {
  return prisma.dinnerGroup.create({
    data: {
      restaurantId,
      notes,
    },
    include: {
      restaurant: true,
    },
  })
}

export async function updateDinnerGroup(id: string, data: { notes?: string }) {
  return prisma.dinnerGroup.update({
    where: { id },
    data,
    include: {
      restaurant: true,
      attendees: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
              image: true,
            },
          },
        },
      },
    },
  })
}

export async function deleteDinnerGroup(id: string) {
  return prisma.dinnerGroup.delete({
    where: { id },
  })
}

// Attendee queries
export async function getAttendeesByUserId(userId: string) {
  return prisma.attendee.findMany({
    where: { userId },
    include: {
      dinnerGroup: {
        include: {
          restaurant: true,
        },
      },
    },
  })
}

export async function getCurrentDinnerGroup(userId: string) {
  return prisma.attendee.findFirst({
    where: { userId },
    include: {
      dinnerGroup: {
        include: {
          restaurant: true,
          attendees: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  name: true,
                  image: true,
                },
              },
            },
          },
        },
      },
    },
  })
}

export async function joinDinnerGroup(userId: string, dinnerGroupId: string) {
  // First, check if the user is already in another dinner group
  const existingAttendee = await prisma.attendee.findFirst({
    where: { userId },
  })

  // If they are, remove them from that group
  if (existingAttendee) {
    await prisma.attendee.delete({
      where: { id: existingAttendee.id },
    })
  }

  // Add them to the new dinner group
  return prisma.attendee.create({
    data: {
      userId,
      dinnerGroupId,
    },
    include: {
      dinnerGroup: {
        include: {
          restaurant: true,
        },
      },
      user: {
        select: {
          id: true,
          username: true,
          name: true,
          image: true,
        },
      },
    },
  })
}

export async function leaveDinnerGroup(userId: string) {
  const attendee = await prisma.attendee.findFirst({
    where: { userId },
  })

  if (!attendee) {
    return null
  }

  return prisma.attendee.delete({
    where: { id: attendee.id },
  })
}

export async function getAttendeesCount(dinnerGroupId: string) {
  return prisma.attendee.count({
    where: { dinnerGroupId },
  })
} 