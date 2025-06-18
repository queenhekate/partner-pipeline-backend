import { list } from "@keystone-6/core";
import type { ListConfig } from "@keystone-6/core";
import type { Lists } from ".keystone/types";
import {
  checkbox,
  text,
  password,
  timestamp,
  select,
  relationship,
  json,
} from "@keystone-6/core/fields";
import { UserRoleValues } from "../utils/values";
import { sendUserUpdateEmail } from './email';
import { permissions, isSignedIn } from "../utils/access";

export const User: ListConfig<Lists.User.TypeInfo<any>, any> = list({
  access: {
    operation: {
      query: ({ session }) => isSignedIn({ session }),
      create: ({ session }) => permissions.isAdminLike({ session }),
      update: ({ session }) =>
        permissions.isAdminLike({ session }) || permissions.isStudent({ session }),
      delete: ({ session }) => permissions.isAdminLike({ session }),
    },
    filter: {
      query: ({ session }) => {
        if (permissions.isAdminLike({ session })) return true;
        if (permissions.isStudent({ session })) {
          return { id: { equals: session?.data?.id } };
        }
        return false;
      },
    },
    item: {
      update: ({ session, item }) =>
        permissions.isAdminLike({ session }) || item.id === session?.data?.id,
      delete: ({ session }) => permissions.isAdminLike({ session }),
    },
  },
  fields: {
    name: text({ validation: { isRequired: true } }),
    email: text({
      validation: { isRequired: true },
      isIndexed: "unique",
    }),
    password: password({
      validation: {
        length: { min: 10, max: 100 },
        isRequired: true,
        rejectCommon: true,
      },
      bcrypt: require("bcryptjs"),
    }),
    role: select({
      options: UserRoleValues.map((value) => ({ label: value, value })),
      defaultValue: "Student",
    }),
    isAdmin: checkbox({ defaultValue: true }),
    createdAt: timestamp({
      defaultValue: { kind: "now" },
    }),
    isActive: checkbox({ defaultValue: false }),
    lastLoginDate: timestamp({
      defaultValue: { kind: "now" },
    }),
  },
  hooks: {
    async afterOperation({ operation, item, originalItem, context }) {
      try {
        if (operation === 'update') {
          await sendUserUpdateEmail(
            item.email,
            'Your Account Was Updated',
            `<p>Hi ${item.name}, your account has been updated.</p>`
          );
        }
      } catch (error) {
        console.error("Failed to send update email:", error);
      }

      try {
        if (["create", "update", "delete"].includes(operation)) {
          await context.db.UserLog.createOne({
            data: {
              user: { connect: { id: item?.id || originalItem?.id } },
              operation,
              before: originalItem ? JSON.stringify(originalItem) : null,
              after: item ? JSON.stringify(item) : null,
              timestamp: new Date().toISOString(),
            },
          });
        }
      } catch (error) {
        console.error("Failed to log user operation:", error);
      }
    },
  },
});

export const UserLog: ListConfig<Lists.UserLog.TypeInfo<any>, any> = list({
  fields: {
    user: relationship({ ref: "User", many: false }),
    operation: text({ validation: { isRequired: true } }), // "create", "update", "delete"
    before: json(),
    after: json(),
    timestamp: timestamp({ defaultValue: { kind: "now" } }),
  },
  access: {
    operation: {
      query: ({ session }) => !!session && session.data.isAdmin,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
});
